-- ============================================================================
-- Fix: pickup_picked_up_workflow cascades to booking_handoffs
--
-- Problem:
--   The original workflow updated pickup_notifications, trips, and
--   vehicle_current_state — but never touched booking_handoffs. As a result:
--     - The passenger UI (which reads booking_handoffs.status) stayed on
--       "Driver confirmed your seat" even after boarding.
--     - If a handoff had already expired (10-min driver-accept window),
--       the pickup was marked PICKED_UP while the handoff remained EXPIRED —
--       a data inconsistency.
--
-- Fix (Option B — lenient expiry):
--   When the driver verifies the PIN, cascade the handoff status to
--   PICKED_UP. Accept either ACCEPTED or EXPIRED as the prior state.
--   Rationale: expiry releases the seat hold but a driver's boarding action
--   should override it — matches rural bus realities where passengers and
--   drivers arrive on flexible timetables.
--
-- Trade-off:
--   A passenger who booked, let the handoff expire, and boarded later will
--   have their handoff revived to PICKED_UP. If someone else booked the
--   same seat in the interim, the seat inventory may temporarily disagree
--   with the physical seating. Driver resolves in person.
-- ============================================================================

create or replace function public.pickup_picked_up_workflow(
  p_pickup_id uuid,
  p_driver_id uuid,
  p_seat_number integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_p pickup_notifications%rowtype;
  v_updated integer;
  v_new_count integer;
begin
  select * into v_p from pickup_notifications where id = p_pickup_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Pickup not found');
  end if;
  if v_p.driver_id <> p_driver_id then
    return jsonb_build_object('success', false, 'status_code', 403, 'error', 'Not your pickup');
  end if;
  if v_p.status = 'PICKED_UP' then
    return jsonb_build_object('success', true, 'status', 'PICKED_UP', 'idempotent', true);
  end if;
  if v_p.status not in ('PENDING','ACKNOWLEDGED') then
    return jsonb_build_object('success', false, 'status_code', 409,
      'error', 'Cannot pick up in status ' || v_p.status::text);
  end if;

  update pickup_notifications
    set status = 'PICKED_UP',
        picked_up_at = now(),
        seat_number = coalesce(p_seat_number, seat_number),
        updated_at = now()
    where id = p_pickup_id
      and status in ('PENDING','ACKNOWLEDGED');

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('success', false, 'status_code', 409,
      'error', 'Pickup already transitioned');
  end if;

  -- Cascade to booking_handoffs. Option B: accept ACCEPTED or EXPIRED.
  update booking_handoffs
    set status = 'PICKED_UP',
        picked_up_at = now(),
        updated_at = now()
    where id = v_p.handoff_id
      and status in ('ACCEPTED', 'EXPIRED');

  update trips
    set current_passenger_count = current_passenger_count + v_p.passenger_count,
        passenger_count = current_passenger_count + v_p.passenger_count,
        updated_at = now()
    where id = v_p.trip_id
    returning current_passenger_count into v_new_count;

  update vehicle_current_state
    set passenger_count = v_new_count, updated_at = now()
    where vehicle_id = v_p.vehicle_id;

  return jsonb_build_object(
    'success', true,
    'status', 'PICKED_UP',
    'passenger_count', v_p.passenger_count,
    'trip_passenger_count', v_new_count
  );
end;
$function$;

-- ─── One-time backfill for the existing inconsistency ────────────────────
-- BTA-X3VFUG (and any other handoffs) had pickup PICKED_UP but handoff EXPIRED.
-- Sync them to PICKED_UP now that the workflow is patched.

update public.booking_handoffs bh
set status = 'PICKED_UP',
    picked_up_at = pn.picked_up_at,
    updated_at = now()
from public.pickup_notifications pn
where pn.handoff_id = bh.id
  and pn.status = 'PICKED_UP'
  and bh.status in ('ACCEPTED', 'EXPIRED');