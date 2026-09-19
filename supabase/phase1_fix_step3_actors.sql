-- ============================================================================
-- B-ETA Booking Flow — Fix Step 3: Correct event inserts
-- Fixes: booking_events uses `metadata` (not `payload`), and requires
--        trip_id + actor_type. Replaces all 4 wrapper functions.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. request_booking() — fixed
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
begin
  v_identity := build_passenger_identity(p_user_id, p_anonymous_id);
  if v_identity is null then
    return jsonb_build_object('success', false, 'error', 'Missing passenger identity');
  end if;

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

  -- ✅ FIXED event insert
  insert into booking_events (
    booking_id, trip_id, event_type, actor_type, actor_id, metadata
  ) values (
    v_handoff_id,
    p_trip_id,
    'requested',
    'passenger',
    v_identity,
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. cancel_booking() — fixed
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

  if not (
    (v_h.user_id is not null and v_h.user_id = p_user_id)
    or (v_h.anonymous_id is not null and v_h.anonymous_id = p_anonymous_id)
  ) then
    return jsonb_build_object('success', false, 'error', 'Not your booking');
  end if;

  if v_h.status not in ('PENDING', 'ACCEPTED') then
    return jsonb_build_object('success', false, 'error', 'Cannot cancel in status ' || v_h.status::text);
  end if;

  v_was_after_acceptance := (v_h.status = 'ACCEPTED');
  v_elapsed_seconds := extract(epoch from (now() - v_h.created_at))::integer;

  update booking_handoffs
  set status = 'CANCELLED', updated_at = now()
  where id = p_handoff_id;

  update pickup_notifications
  set status = 'CANCELLED', updated_at = now()
  where handoff_id = p_handoff_id and status in ('PENDING', 'ACKNOWLEDGED');

  if v_was_after_acceptance then
    v_cooldown_until := now() + interval '5 minutes';
  elsif v_elapsed_seconds < 60 then
    v_cooldown_until := null;
  end if;

  select count(*) into v_recent_count
  from passenger_cancellation_log
  where passenger_identity = v_identity and cancelled_at > now() - interval '1 hour';

  if (v_recent_count + 1) >= 3 then
    v_cooldown_until := greatest(coalesce(v_cooldown_until, now()), now() + interval '30 minutes');
  end if;

  insert into passenger_cancellation_log (
    passenger_identity, handoff_id, cancelled_at, was_after_acceptance, cooldown_until
  ) values (
    v_identity, p_handoff_id, now(), v_was_after_acceptance, v_cooldown_until
  );

  -- ✅ FIXED event insert
  insert into booking_events (
    booking_id, trip_id, event_type, actor_type, actor_id, metadata
  ) values (
    p_handoff_id,
    v_h.trip_id,
    'cancelled',
    'passenger',
    v_identity,
    jsonb_build_object(
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. driver_accept_pickup() — fixed
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
    return jsonb_build_object('success', true, 'status', 'ACKNOWLEDGED', 'booking_pin', v_p.booking_pin, 'idempotent', true);
  end if;

  if v_p.status <> 'PENDING' then
    return jsonb_build_object('success', false, 'error', 'Cannot accept in status ' || v_p.status::text);
  end if;

  if v_p.expires_at <= now() then
    update pickup_notifications
    set status = 'CANCELLED', auto_cancelled = true, updated_at = now()
    where id = p_pickup_id;

    if v_p.handoff_id is not null then
      update booking_handoffs
      set status = 'EXPIRED', updated_at = now()
      where id = v_p.handoff_id;
    end if;

    return jsonb_build_object('success', false, 'error', 'Booking expired before acceptance');
  end if;

  v_pin := generate_booking_pin();

  update booking_handoffs
  set status = 'ACCEPTED', booking_pin = v_pin, accepted_at = now(), driver_id = p_driver_id, updated_at = now()
  where id = v_p.handoff_id;

  update pickup_notifications
  set status = 'ACKNOWLEDGED', booking_pin = v_pin, driver_acknowledged_at = now(), updated_at = now()
  where id = p_pickup_id;

  -- ✅ FIXED event insert
  insert into booking_events (
    booking_id, trip_id, event_type, actor_type, actor_id, metadata
  ) values (
    v_p.handoff_id,
    v_p.trip_id,
    'accepted_by_driver',
    'driver',
    p_driver_id::text,
    jsonb_build_object('pickup_id', p_pickup_id, 'pin_generated', true)
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. driver_decline_pickup() — fixed
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
    return jsonb_build_object('success', false, 'error', 'Cannot decline in status ' || v_p.status::text);
  end if;

  update booking_handoffs
  set status = 'DECLINED', declined_at = now(), decline_reason = p_reason, updated_at = now()
  where id = v_p.handoff_id;

  update pickup_notifications
  set status = 'MISSED', missed_at = now(), missed_reason = coalesce(p_reason, 'Driver declined'), updated_at = now()
  where id = p_pickup_id;

  -- ✅ FIXED event insert
  insert into booking_events (
    booking_id, trip_id, event_type, actor_type, actor_id, metadata
  ) values (
    v_p.handoff_id,
    v_p.trip_id,
    'declined_by_driver',
    'driver',
    p_driver_id::text,
    jsonb_build_object('pickup_id', p_pickup_id, 'reason', p_reason)
  );

  return jsonb_build_object('success', true, 'status', 'DECLINED');
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. driver_verify_pin() — fixed
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.driver_verify_pin(
  p_pickup_id uuid,
  p_driver_id uuid,
  p_pin text,
  p_seat_number integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_p pickup_notifications%rowtype;
  v_pickup_result jsonb;
  v_max_attempts constant integer := 3;
  v_new_attempts integer;
begin
  if p_pin is null or length(trim(p_pin)) = 0 then
    return jsonb_build_object('success', false, 'error', 'PIN required');
  end if;

  select * into v_p from pickup_notifications where id = p_pickup_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Pickup not found');
  end if;

  if v_p.driver_id <> p_driver_id then
    return jsonb_build_object('success', false, 'error', 'Not your pickup');
  end if;

  if v_p.status = 'PICKED_UP' then
    return jsonb_build_object('success', true, 'status', 'PICKED_UP', 'idempotent', true);
  end if;

  if v_p.status not in ('ACKNOWLEDGED', 'PENDING') then
    return jsonb_build_object('success', false, 'error', 'Cannot verify PIN in status ' || v_p.status::text);
  end if;

  if v_p.booking_pin is null then
    return jsonb_build_object('success', false, 'error', 'Booking has not been accepted yet');
  end if;

  if v_p.booking_pin = trim(p_pin) then
    v_pickup_result := pickup_picked_up_workflow(
      p_pickup_id := p_pickup_id,
      p_driver_id := p_driver_id,
      p_seat_number := p_seat_number
    );

    if not (v_pickup_result->>'success')::boolean then
      return jsonb_build_object('success', false, 'error', 'PIN matched but boarding failed: ' || coalesce(v_pickup_result->>'error', 'unknown'));
    end if;

    -- ✅ FIXED event insert
    insert into booking_events (
      booking_id, trip_id, event_type, actor_type, actor_id, metadata
    ) values (
      v_p.handoff_id,
      v_p.trip_id,
      'pin_verified',
      'driver',
      p_driver_id::text,
      jsonb_build_object('pickup_id', p_pickup_id, 'seat_number', p_seat_number, 'attempts_before_success', v_p.pin_attempts)
    );

    return jsonb_build_object(
      'success', true,
      'status', 'PICKED_UP',
      'passenger_count', v_p.passenger_count,
      'trip_passenger_count', (v_pickup_result->>'trip_passenger_count')::int
    );
  else
    v_new_attempts := v_p.pin_attempts + 1;

    update pickup_notifications
    set pin_attempts = v_new_attempts, updated_at = now()
    where id = p_pickup_id;

    -- ✅ FIXED event insert
    insert into booking_events (
      booking_id, trip_id, event_type, actor_type, actor_id, metadata
    ) values (
      v_p.handoff_id,
      v_p.trip_id,
      'pin_failed',
      'driver',
      p_driver_id::text,
      jsonb_build_object('pickup_id', p_pickup_id, 'attempt_number', v_new_attempts)
    );

    if v_new_attempts >= v_max_attempts then
      update pickup_notifications
      set status = 'MISSED', missed_at = now(), missed_reason = 'Max PIN attempts exceeded', updated_at = now()
      where id = p_pickup_id;

      update booking_handoffs
      set status = 'NO_SHOW', no_show_at = now(), updated_at = now()
      where id = v_p.handoff_id;

      insert into booking_events (
        booking_id, trip_id, event_type, actor_type, actor_id, metadata
      ) values (
        v_p.handoff_id,
        v_p.trip_id,
        'no_show_pin_exhausted',
        'system',
        null,
        jsonb_build_object('pickup_id', p_pickup_id, 'attempts', v_new_attempts)
      );

      return jsonb_build_object(
        'success', false,
        'error', 'Max PIN attempts exceeded. Booking marked NO_SHOW.',
        'pin_attempts', v_new_attempts,
        'status', 'NO_SHOW'
      );
    end if;

    return jsonb_build_object(
      'success', false,
      'error', 'Incorrect PIN',
      'pin_attempts', v_new_attempts,
      'attempts_remaining', v_max_attempts - v_new_attempts
    );
  end if;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. expire_stale_bookings() — fixed
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.expire_stale_bookings()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_expired_handoffs integer := 0;
  v_expired_pickups integer := 0;
  v_rec record;
begin
  for v_rec in
    select id, trip_id
    from booking_handoffs
    where status = 'PENDING' and expires_at <= now()
    for update skip locked
  loop
    update booking_handoffs
    set status = 'EXPIRED', updated_at = now()
    where id = v_rec.id;
    v_expired_handoffs := v_expired_handoffs + 1;

    update pickup_notifications
    set status = 'CANCELLED', auto_cancelled = true, updated_at = now()
    where handoff_id = v_rec.id and status = 'PENDING';
    v_expired_pickups := v_expired_pickups + 1;

    -- ✅ FIXED event insert
    insert into booking_events (
      booking_id, trip_id, event_type, actor_type, actor_id, metadata
    ) values (
      v_rec.id,
      v_rec.trip_id,
      'expired_by_cron',
      'system',
      null,
      jsonb_build_object('expired_at', now())
    );
  end loop;

  return jsonb_build_object(
    'success', true,
    'expired_handoffs', v_expired_handoffs,
    'expired_pickups', v_expired_pickups
  );
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification
-- ═══════════════════════════════════════════════════════════════════════════

select proname as function_name, 'replaced' as status
from pg_proc
where proname in (
  'request_booking', 'cancel_booking',
  'driver_accept_pickup', 'driver_decline_pickup',
  'driver_verify_pin', 'expire_stale_bookings'
)
order by proname;