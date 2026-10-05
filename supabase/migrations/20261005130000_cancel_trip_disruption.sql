-- ─────────────────────────────────────────────────────────────────────────
-- cancel_trip_workflow: flag boarded passengers as disrupted
--
-- When an operator cancels a trip via cancel_trip_workflow, passengers who
-- have already boarded (status = PICKED_UP) were previously left stuck with
-- handoff_status = PICKED_UP forever. That prevents the passenger app from
-- releasing the active booking slot, so the passenger cannot book another
-- bus, and the booking is silently orphaned.
--
-- This migration:
--   * closes PICKED_UP handoffs as CANCELLED (frees the passenger)
--   * flags boarded-but-not-delivered pickups with disruption_flag = true
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.cancel_trip_workflow(
  p_assignment_id uuid,
  p_by uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_a trip_assignments%rowtype;
  v_now timestamptz := now();
  v_cancelled_handoffs integer := 0;
  v_disrupted_count integer := 0;
begin
  select * into v_a from trip_assignments where id = p_assignment_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Assignment not found');
  end if;
  if v_a.status not in ('PENDING','ACCEPTED') then
    return jsonb_build_object('success', false, 'error', 'Cannot cancel in status ' || v_a.status);
  end if;

  update trip_assignments
    set status = 'CANCELLED', cancelled_at = v_now,
        cancel_reason = p_reason, updated_at = v_now
    where id = p_assignment_id;

  update trips
    set status = 'CANCELLED', cancel_reason = p_reason,
        cancelled_by = p_by, updated_at = v_now
    where id = v_a.trip_id;

  update timetable_slots
    set claimed_trip_id = null, updated_at = v_now
    where claimed_trip_id = v_a.trip_id;

  -- Cancel PENDING handoffs (never accepted)
  update booking_handoffs
    set status = 'CANCELLED', updated_at = v_now
    where trip_id = v_a.trip_id and status = 'PENDING';

  -- NEW: close PICKED_UP handoffs too so the passenger app releases the
  -- active-booking slot. A cancelled trip is not a successful trip.
  update booking_handoffs
    set status = 'CANCELLED', updated_at = v_now
    where trip_id = v_a.trip_id and status = 'PICKED_UP';
  get diagnostics v_cancelled_handoffs = row_count;

  update pickup_notifications
    set status = 'CANCELLED', updated_at = v_now
    where trip_id = v_a.trip_id and status in ('PENDING','ACKNOWLEDGED');

  -- NEW: flag boarded-but-not-delivered passengers as disrupted
  update pickup_notifications
    set disruption_flag = true, updated_at = v_now
    where trip_id = v_a.trip_id
      and status = 'PICKED_UP'
      and alighted_at is null;
  get diagnostics v_disrupted_count = row_count;

  insert into audit_logs (action, user_id, entity_type, entity_id, operator_id, details)
  values ('trip_cancelled', p_by::text, 'trip', v_a.trip_id::text, v_a.operator_id,
    jsonb_build_object(
      'reason', p_reason,
      'cancelled_handoffs', v_cancelled_handoffs,
      'disrupted_passengers', v_disrupted_count
    ));

  return jsonb_build_object(
    'success', true,
    'status', 'CANCELLED',
    'cancelled_handoffs', v_cancelled_handoffs,
    'disrupted_passengers', v_disrupted_count
  );
end;
$function$;