-- ============================================================================
-- B-ETA — Enforce single active booking per passenger
-- Modifies request_booking() to reject if passenger already has an active one.
-- ============================================================================

create or replace function public.request_booking(
  p_trip_id uuid,
  p_from_stop_id uuid,
  p_to_stop_id uuid,
  p_requested_seats integer,
  p_user_id uuid default null,
  p_anonymous_id text default null,
  p_passenger_name text default null,
  p_passenger_phone text default null,
  p_preferred_seat integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_identity text;
  v_cooldown jsonb;
  v_result jsonb;
  v_handoff_id uuid;
  v_token text;
  v_trip trips%rowtype;
  v_driver_id uuid;
  v_expires_10min timestamptz := now() + interval '10 minutes';
  v_pickup_id uuid;
  v_booking_reference text;
  v_active_booking record;
begin
  v_identity := build_passenger_identity(p_user_id, p_anonymous_id);
  if v_identity is null then
    return jsonb_build_object('success', false, 'error', 'Missing passenger identity');
  end if;

  -- ═══════════════════════════════════════════════════════════════════════
  -- NEW: Reject if this passenger already has an active booking
  -- ═══════════════════════════════════════════════════════════════════════

  select 
    h.id as handoff_id,
    h.booking_reference,
    h.status,
    h.expires_at
  into v_active_booking
  from public.booking_handoffs h
  where h.status in ('PENDING', 'ACCEPTED')
    and h.expires_at > now()
    and (
      (h.user_id is not null and h.user_id = p_user_id)
      or (h.anonymous_id is not null and h.anonymous_id = p_anonymous_id)
    )
  order by h.created_at desc
  limit 1;

  if v_active_booking.handoff_id is not null then
    return jsonb_build_object(
      'success', false,
      'error', 'You already have an active booking. Cancel it first or wait for it to expire.',
      'active_booking', jsonb_build_object(
        'handoff_id', v_active_booking.handoff_id,
        'booking_reference', v_active_booking.booking_reference,
        'status', v_active_booking.status,
        'expires_at', v_active_booking.expires_at
      )
    );
  end if;

  -- ═══════════════════════════════════════════════════════════════════════
  -- Original logic continues
  -- ═══════════════════════════════════════════════════════════════════════

  v_cooldown := check_passenger_cooldown(v_identity);
  if not (v_cooldown->>'allowed')::boolean then
    return jsonb_build_object(
      'success', false,
      'error', 'Passenger is in cooldown',
      'cooldown', v_cooldown
    );
  end if;

  select * into v_trip from trips where id = p_trip_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Trip not found');
  end if;
  v_driver_id := v_trip.driver_id;

  v_result := create_handoff_reservation_workflow(
    p_trip_id := p_trip_id,
    p_from_stop_id := p_from_stop_id,
    p_to_stop_id := p_to_stop_id,
    p_requested_seats := p_requested_seats,
    p_user_id := p_user_id,
    p_anonymous_id := p_anonymous_id,
    p_passenger_name := p_passenger_name,
    p_passenger_phone := p_passenger_phone,
    p_preferred_seat := p_preferred_seat
  );

  if not (v_result->>'success')::boolean then
    return v_result;
  end if;

  v_handoff_id := (v_result->>'handoff_id')::uuid;
  v_token := v_result->>'token';

  update booking_handoffs
  set expires_at = v_expires_10min,
      expires_reason = 'driver_acceptance_window_10min'
  where id = v_handoff_id;

  v_booking_reference := generate_booking_reference();
  update booking_handoffs
  set booking_reference = v_booking_reference
  where id = v_handoff_id;

  insert into pickup_notifications (
    trip_id, vehicle_id, driver_id, from_stop_id, to_stop_id,
    handoff_id, operator_id, passenger_count, booking_reference,
    passenger_name, passenger_phone, status, expires_at
  ) values (
    p_trip_id, v_trip.vehicle_id, v_driver_id, p_from_stop_id, p_to_stop_id,
    v_handoff_id, v_trip.operator_id, p_requested_seats, v_booking_reference,
    p_passenger_name, p_passenger_phone, 'PENDING', v_expires_10min
  ) returning id into v_pickup_id;

  insert into booking_events (
    booking_id, trip_id, event_type, actor_type, actor_id, metadata
  ) values (
    v_handoff_id, p_trip_id, 'requested', 'passenger', v_identity,
    jsonb_build_object(
      'from_stop_id', p_from_stop_id,
      'to_stop_id', p_to_stop_id,
      'seats', p_requested_seats,
      'pickup_id', v_pickup_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'handoff_id', v_handoff_id,
    'pickup_id', v_pickup_id,
    'token', v_token,
    'booking_reference', v_booking_reference,
    'expires_at', v_expires_10min,
    'status', 'PENDING'
  );
end;
$function$;

-- Verify
select exists (select 1 from pg_proc where proname = 'request_booking') as updated;