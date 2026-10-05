-- ─────────────────────────────────────────────────────────────────────────
-- Trip disruption flag
--
-- When a trip ends (normally or by force), any passenger still marked
-- PICKED_UP whose alighted_at is null was never delivered to their stop.
-- Previously:
--   * end_trip_workflow silently flipped them to DROPPED_OFF (fake success)
--   * force_end_trip_workflow left them stuck as PICKED_UP forever
--
-- After this migration:
--   * both flows set disruption_flag = true on those passengers
--   * pickup_notifications.status is left honest (PICKED_UP stays PICKED_UP)
--   * force_end_workflow also closes the handoff row (CANCELLED) so the
--     passenger is freed to book again
-- ─────────────────────────────────────────────────────────────────────────

alter table pickup_notifications
  add column if not exists disruption_flag boolean not null default false;

-- ── end_trip_workflow ────────────────────────────────────────────────────
create or replace function public.end_trip_workflow(
  p_trip_id uuid,
  p_final_count integer default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_trip trips%rowtype;
  v_now timestamptz := now();
  v_accepted_count integer := 0;
  v_picked_up_count integer := 0;
  v_disrupted_count integer := 0;
begin
  select * into v_trip from trips where id = p_trip_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Trip not found');
  end if;
  if v_trip.status <> 'IN_PROGRESS' then
    return jsonb_build_object('success', false, 'error', 'Trip is not in progress');
  end if;

  update trips
    set status = 'COMPLETED',
        ended_at = v_now,
        completion_reason = 'NORMAL',
        current_passenger_count = coalesce(p_final_count, current_passenger_count),
        updated_at = v_now
    where id = p_trip_id;

  update vehicles
    set current_driver_id = null, updated_at = v_now
    where id = v_trip.vehicle_id;

  update vehicle_current_state
    set status = 'IDLE', trip_id = null, driver_id = null, updated_at = v_now
    where vehicle_id = v_trip.vehicle_id;

  -- Cancel PENDING handoffs (never accepted)
  update booking_handoffs
    set status = 'CANCELLED', updated_at = v_now
    where trip_id = p_trip_id and status = 'PENDING';

  -- Accepted but never boarded -> NO_SHOW
  update booking_handoffs
    set status = 'NO_SHOW', no_show_at = v_now, updated_at = v_now
    where trip_id = p_trip_id and status = 'ACCEPTED';
  get diagnostics v_accepted_count = row_count;

  -- Boarded passengers get a terminal handoff status so the passenger app
  -- releases the active-booking slot and they can book again.
  update booking_handoffs
    set status = 'COMPLETED', completed_at = v_now, updated_at = v_now
    where trip_id = p_trip_id and status = 'PICKED_UP';
  get diagnostics v_picked_up_count = row_count;

  -- Cancel PENDING/ACKNOWLEDGED pickups (never boarded)
  update pickup_notifications
    set status = 'CANCELLED', updated_at = v_now
    where trip_id = p_trip_id and status in ('PENDING','ACKNOWLEDGED');

  -- Boarded but never alighted -> disruption flag. Do NOT fake DROPPED_OFF.
  update pickup_notifications
    set disruption_flag = true, updated_at = v_now
    where trip_id = p_trip_id
      and status = 'PICKED_UP'
      and alighted_at is null;
  get diagnostics v_disrupted_count = row_count;

  insert into audit_logs (action, user_id, entity_type, entity_id, operator_id, details)
  values ('trip_ended', null, 'trip', p_trip_id::text, v_trip.operator_id,
    jsonb_build_object(
      'final_count', p_final_count,
      'accepted_marked_no_show', v_accepted_count,
      'picked_up_marked_completed', v_picked_up_count,
      'disrupted_passengers', v_disrupted_count
    ));

  insert into notifications (operator_id, role, type, title, body, data)
  values (
    v_trip.operator_id, 'operator', 'DRIVER_ENDED',
    'Trip ended',
    'A driver ended a trip.',
    jsonb_build_object('trip_id', p_trip_id)
  );

  return jsonb_build_object(
    'success', true,
    'status', 'COMPLETED',
    'ended_at', v_now,
    'accepted_marked_no_show', v_accepted_count,
    'picked_up_marked_completed', v_picked_up_count,
    'disrupted_passengers', v_disrupted_count
  );
end;
$function$;

-- ── force_end_trip_workflow ──────────────────────────────────────────────
create or replace function public.force_end_trip_workflow(
  p_trip_id uuid,
  p_by uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_trip trips%rowtype;
  v_now timestamptz := now();
  v_disrupted_count integer := 0;
  v_cancelled_handoffs integer := 0;
begin
  select * into v_trip from trips where id = p_trip_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Trip not found');
  end if;
  if v_trip.status <> 'IN_PROGRESS' then
    return jsonb_build_object('success', false, 'error', 'Trip is not in progress');
  end if;

  update trips
    set status = 'COMPLETED',
        ended_at = v_now,
        completion_reason = 'FORCE_ENDED',
        force_ended_by = p_by,
        force_end_reason = p_reason,
        updated_at = v_now
    where id = p_trip_id;

  update vehicles
    set current_driver_id = null, updated_at = v_now
    where id = v_trip.vehicle_id;

  update vehicle_current_state
    set status = 'IDLE', trip_id = null, driver_id = null, updated_at = v_now
    where vehicle_id = v_trip.vehicle_id;

  -- Cancel PENDING handoffs (never accepted)
  update booking_handoffs
    set status = 'CANCELLED', updated_at = v_now
    where trip_id = p_trip_id and status = 'PENDING';

  -- NEW: close PICKED_UP handoffs too so the passenger app releases the
  -- active-booking slot. A cancelled trip is not a completed trip.
  update booking_handoffs
    set status = 'CANCELLED', updated_at = v_now
    where trip_id = p_trip_id and status = 'PICKED_UP';
  get diagnostics v_cancelled_handoffs = row_count;

  update pickup_notifications
    set status = 'CANCELLED', updated_at = v_now
    where trip_id = p_trip_id and status in ('PENDING','ACKNOWLEDGED');

  -- NEW: flag boarded-but-not-delivered passengers as disrupted
  update pickup_notifications
    set disruption_flag = true, updated_at = v_now
    where trip_id = p_trip_id
      and status = 'PICKED_UP'
      and alighted_at is null;
  get diagnostics v_disrupted_count = row_count;

  insert into audit_logs (action, user_id, entity_type, entity_id, operator_id, details)
  values ('trip_force_ended', p_by::text, 'trip', p_trip_id::text, v_trip.operator_id,
    jsonb_build_object(
      'reason', p_reason,
      'cancelled_handoffs', v_cancelled_handoffs,
      'disrupted_passengers', v_disrupted_count
    ));

  insert into notifications (driver_id, operator_id, role, type, title, body, data)
  values (
    v_trip.driver_id, v_trip.operator_id, 'driver',
    'TRIP_FORCE_ENDED',
    'Trip force-ended',
    'Your trip was force-ended by the operator.',
    jsonb_build_object('trip_id', p_trip_id, 'reason', p_reason)
  );

  return jsonb_build_object(
    'success', true,
    'status', 'COMPLETED',
    'completion_reason', 'FORCE_ENDED',
    'cancelled_handoffs', v_cancelled_handoffs,
    'disrupted_passengers', v_disrupted_count
  );
end;
$function$;