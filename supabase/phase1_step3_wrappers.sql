-- ============================================================================
-- B-ETA Booking Flow — Phase 1, Step 3: Wrapper Functions
-- Extends existing workflows. Does not modify existing functions.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. request_booking() — passenger requests a booking
--    - Checks cooldown
--    - Calls create_handoff_reservation_workflow
--    - Sets 10-minute expiry (override)
--    - Creates a matching pickup_notifications row (so driver sees it)
-- ═══════════════════════════════════════════════════════════════════════════

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
set search_path to 'public'
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
begin
  -- Validate identity
  v_identity := build_passenger_identity(p_user_id, p_anonymous_id);
  if v_identity is null then
    return jsonb_build_object('success', false, 'error', 'Missing passenger identity');
  end if;

  -- Check cooldown
  v_cooldown := check_passenger_cooldown(v_identity);
  if not (v_cooldown->>'allowed')::boolean then
    return jsonb_build_object(
      'success', false,
      'error', 'Passenger is in cooldown',
      'cooldown', v_cooldown
    );
  end if;

  -- Load trip to get the driver_id
  select * into v_trip from trips where id = p_trip_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Trip not found');
  end if;
  v_driver_id := v_trip.driver_id;

  -- Call the existing workflow (which sets 30-min expiry)
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

  -- Override the 30-min expiry to 10 minutes
  update booking_handoffs
  set expires_at = v_expires_10min,
      expires_reason = 'driver_acceptance_window_10min'
  where id = v_handoff_id;

  -- Generate a booking reference for the passenger
  v_booking_reference := generate_booking_reference();
  update booking_handoffs
  set booking_reference = v_booking_reference
  where id = v_handoff_id;

  -- Create pickup_notifications row so the driver sees it
  insert into pickup_notifications (
    trip_id,
    vehicle_id,
    driver_id,
    from_stop_id,
    to_stop_id,
    handoff_id,
    operator_id,
    passenger_count,
    booking_reference,
    passenger_name,
    passenger_phone,
    status,
    expires_at
  ) values (
    p_trip_id,
    v_trip.vehicle_id,
    v_driver_id,
    p_from_stop_id,
    p_to_stop_id,
    v_handoff_id,
    v_trip.operator_id,
    p_requested_seats,
    v_booking_reference,
    p_passenger_name,
    p_passenger_phone,
    'PENDING',
    v_expires_10min
  ) returning id into v_pickup_id;

  -- Log the request event
  insert into booking_events (booking_id, event_type, payload)
  values (
    v_handoff_id,
    'requested',
    jsonb_build_object(
      'trip_id', p_trip_id,
      'from_stop_id', p_from_stop_id,
      'to_stop_id', p_to_stop_id,
      'seats', p_requested_seats,
      'identity', v_identity,
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

comment on function public.request_booking is
  'Passenger requests a booking. Wraps create_handoff_reservation_workflow, forces 10-min expiry, creates a pickup_notifications row for the driver.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. cancel_booking() — passenger cancels
--    - Releases the hold
--    - Logs for cooldown tracking
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.cancel_booking(
  p_handoff_id uuid,
  p_user_id uuid default null,
  p_anonymous_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_h booking_handoffs%rowtype;
  v_identity text;
  v_was_after_acceptance boolean := false;
  v_cooldown_until timestamptz;
  v_recent_count integer;
  v_elapsed_seconds integer;
begin
  v_identity := build_passenger_identity(p_user_id, p_anonymous_id);
  if v_identity is null then
    return jsonb_build_object('success', false, 'error', 'Missing passenger identity');
  end if;

  select * into v_h from booking_handoffs where id = p_handoff_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Booking not found');
  end if;

  -- Ownership check
  if not (
    (v_h.user_id is not null and v_h.user_id = p_user_id)
    or (v_h.anonymous_id is not null and v_h.anonymous_id = p_anonymous_id)
  ) then
    return jsonb_build_object('success', false, 'error', 'Not your booking');
  end if;

  -- Only allow cancellation in PENDING or ACCEPTED
  if v_h.status not in ('PENDING', 'ACCEPTED') then
    return jsonb_build_object(
      'success', false,
      'error', 'Cannot cancel in status ' || v_h.status::text
    );
  end if;

  -- Was this after driver acceptance?
  v_was_after_acceptance := (v_h.status = 'ACCEPTED');
  v_elapsed_seconds := extract(epoch from (now() - v_h.created_at))::integer;

  -- Update the handoff
  update booking_handoffs
  set status = 'CANCELLED',
      updated_at = now()
  where id = p_handoff_id;

  -- Update matching pickup_notification
  update pickup_notifications
  set status = 'CANCELLED',
      updated_at = now()
  where handoff_id = p_handoff_id
    and status in ('PENDING', 'ACKNOWLEDGED');

  -- Compute cooldown
  if v_was_after_acceptance then
    v_cooldown_until := now() + interval '5 minutes';
  elsif v_elapsed_seconds < 60 then
    v_cooldown_until := null; -- No cooldown for <60s cancel
  end if;

  -- Count recent cancellations
  select count(*) into v_recent_count
  from passenger_cancellation_log
  where passenger_identity = v_identity
    and cancelled_at > now() - interval '1 hour';

  -- If this is the 3rd+ in an hour, extend cooldown to 30 min
  if (v_recent_count + 1) >= 3 then
    v_cooldown_until := greatest(
      coalesce(v_cooldown_until, now()),
      now() + interval '30 minutes'
    );
  end if;

  -- Log it
  insert into passenger_cancellation_log (
    passenger_identity,
    handoff_id,
    cancelled_at,
    was_after_acceptance,
    cooldown_until
  ) values (
    v_identity,
    p_handoff_id,
    now(),
    v_was_after_acceptance,
    v_cooldown_until
  );

  -- Log the event
  insert into booking_events (booking_id, event_type, payload)
  values (
    p_handoff_id,
    'cancelled',
    jsonb_build_object(
      'identity', v_identity,
      'was_after_acceptance', v_was_after_acceptance,
      'elapsed_seconds', v_elapsed_seconds,
      'cooldown_until', v_cooldown_until
    )
  );

  return jsonb_build_object(
    'success', true,
    'status', 'CANCELLED',
    'cooldown_until', v_cooldown_until,
    'recent_cancellations', v_recent_count + 1
  );
end;
$function$;

comment on function public.cancel_booking is
  'Passenger cancels a booking. Releases hold, logs for cooldown, updates pickup_notification.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. driver_accept_pickup() — driver accepts a booking
--    - Generates PIN
--    - Updates handoff to ACCEPTED
--    - Updates pickup_notification to ACKNOWLEDGED with PIN
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.driver_accept_pickup(
  p_pickup_id uuid,
  p_driver_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_p pickup_notifications%rowtype;
  v_pin text;
begin
  select * into v_p from pickup_notifications where id = p_pickup_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Pickup not found');
  end if;

  if v_p.driver_id <> p_driver_id then
    return jsonb_build_object('success', false, 'error', 'Not your pickup');
  end if;

  if v_p.status = 'ACKNOWLEDGED' then
    return jsonb_build_object(
      'success', true,
      'status', 'ACKNOWLEDGED',
      'booking_pin', v_p.booking_pin,
      'idempotent', true
    );
  end if;

  if v_p.status <> 'PENDING' then
    return jsonb_build_object(
      'success', false,
      'error', 'Cannot accept in status ' || v_p.status::text
    );
  end if;

  if v_p.expires_at <= now() then
    update pickup_notifications
    set status = 'CANCELLED',
        auto_cancelled = true,
        updated_at = now()
    where id = p_pickup_id;

    if v_p.handoff_id is not null then
      update booking_handoffs
      set status = 'EXPIRED',
          updated_at = now()
      where id = v_p.handoff_id;
    end if;

    return jsonb_build_object('success', false, 'error', 'Booking expired before acceptance');
  end if;

  -- Generate PIN
  v_pin := generate_booking_pin();

  -- Update handoff to ACCEPTED with PIN
  update booking_handoffs
  set status = 'ACCEPTED',
      booking_pin = v_pin,
      accepted_at = now(),
      driver_id = p_driver_id,
      updated_at = now()
  where id = v_p.handoff_id;

  -- Update pickup_notification
  update pickup_notifications
  set status = 'ACKNOWLEDGED',
      booking_pin = v_pin,
      driver_acknowledged_at = now(),
      updated_at = now()
  where id = p_pickup_id;

  -- Log
  insert into booking_events (booking_id, event_type, payload)
  values (
    v_p.handoff_id,
    'accepted_by_driver',
    jsonb_build_object(
      'pickup_id', p_pickup_id,
      'driver_id', p_driver_id,
      'pin_generated', true
    )
  );

  return jsonb_build_object(
    'success', true,
    'status', 'ACKNOWLEDGED',
    'booking_pin', v_pin,
    'passenger_name', v_p.passenger_name,
    'from_stop_id', v_p.from_stop_id,
    'to_stop_id', v_p.to_stop_id,
    'passenger_count', v_p.passenger_count
  );
end;
$function$;

comment on function public.driver_accept_pickup is
  'Driver accepts a pending pickup. Generates 6-digit PIN. Marks handoff ACCEPTED and pickup ACKNOWLEDGED.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. driver_decline_pickup() — driver declines
--    - Releases hold
--    - Logs the decline
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.driver_decline_pickup(
  p_pickup_id uuid,
  p_driver_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_p pickup_notifications%rowtype;
begin
  select * into v_p from pickup_notifications where id = p_pickup_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Pickup not found');
  end if;

  if v_p.driver_id <> p_driver_id then
    return jsonb_build_object('success', false, 'error', 'Not your pickup');
  end if;

  if v_p.status not in ('PENDING', 'ACKNOWLEDGED') then
    return jsonb_build_object(
      'success', false,
      'error', 'Cannot decline in status ' || v_p.status::text
    );
  end if;

  -- Update handoff
  update booking_handoffs
  set status = 'DECLINED',
      declined_at = now(),
      decline_reason = p_reason,
      updated_at = now()
  where id = v_p.handoff_id;

  -- Update pickup
  update pickup_notifications
  set status = 'MISSED',
      missed_at = now(),
      missed_reason = coalesce(p_reason, 'Driver declined'),
      updated_at = now()
  where id = p_pickup_id;

  -- Log
  insert into booking_events (booking_id, event_type, payload)
  values (
    v_p.handoff_id,
    'declined_by_driver',
    jsonb_build_object(
      'pickup_id', p_pickup_id,
      'driver_id', p_driver_id,
      'reason', p_reason
    )
  );

  return jsonb_build_object(
    'success', true,
    'status', 'DECLINED'
  );
end;
$function$;

comment on function public.driver_decline_pickup is
  'Driver declines a pickup. Releases hold, marks handoff DECLINED and pickup MISSED.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Verification
-- ═══════════════════════════════════════════════════════════════════════════

select 
  'request_booking' as function_name,
  exists (select 1 from pg_proc where proname='request_booking') as created
union all
select 
  'cancel_booking',
  exists (select 1 from pg_proc where proname='cancel_booking')
union all
select 
  'driver_accept_pickup',
  exists (select 1 from pg_proc where proname='driver_accept_pickup')
union all
select 
  'driver_decline_pickup',
  exists (select 1 from pg_proc where proname='driver_decline_pickup');