create or replace function public.end_trip_workflow(
  p_trip_id uuid,
  p_final_count integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_trip trips%rowtype;
  v_now timestamptz := now();
  v_accepted_count integer := 0;
  v_picked_up_count integer := 0;
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

  -- NEW: mark ACCEPTED handoffs as NO_SHOW (accepted but never boarded)
  update booking_handoffs
    set status = 'NO_SHOW', no_show_at = v_now, updated_at = v_now
    where trip_id = p_trip_id and status = 'ACCEPTED';
  get diagnostics v_accepted_count = row_count;

  -- NEW: mark PICKED_UP handoffs as COMPLETED (boarded but not dropped via auto_alight)
  update booking_handoffs
    set status = 'COMPLETED', completed_at = v_now, updated_at = v_now
    where trip_id = p_trip_id and status = 'PICKED_UP';
  get diagnostics v_picked_up_count = row_count;

  -- Cancel PENDING/ACKNOWLEDGED pickups (never boarded)
  update pickup_notifications
    set status = 'CANCELLED', updated_at = v_now
    where trip_id = p_trip_id and status in ('PENDING','ACKNOWLEDGED');

  -- NEW: mark PICKED_UP pickups as DROPPED_OFF (boarded but never dropped)
  update pickup_notifications
    set status = 'DROPPED_OFF', alighted_at = v_now, updated_at = v_now
    where trip_id = p_trip_id and status = 'PICKED_UP' and alighted_at is null;

  insert into audit_logs (action, user_id, entity_type, entity_id, operator_id, details)
  values ('trip_ended', null, 'trip', p_trip_id::text, v_trip.operator_id,
    jsonb_build_object(
      'final_count', p_final_count,
      'accepted_marked_no_show', v_accepted_count,
      'picked_up_marked_completed', v_picked_up_count
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
    'picked_up_marked_completed', v_picked_up_count
  );
end;
$function$;