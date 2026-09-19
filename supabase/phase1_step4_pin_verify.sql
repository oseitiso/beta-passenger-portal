-- ============================================================================
-- B-ETA Booking Flow — Phase 1, Step 4: PIN Verification
-- Closes the loop between driver acceptance and passenger boarding.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. driver_verify_pin() — driver confirms boarding via PIN
--    - 3 failed attempts → NO_SHOW + release
--    - Success → calls pickup_picked_up_workflow
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
  -- Validate inputs
  if p_pin is null or length(trim(p_pin)) = 0 then
    return jsonb_build_object('success', false, 'error', 'PIN required');
  end if;

  -- Load pickup
  select * into v_p from pickup_notifications where id = p_pickup_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Pickup not found');
  end if;

  -- Ownership check
  if v_p.driver_id <> p_driver_id then
    return jsonb_build_object('success', false, 'error', 'Not your pickup');
  end if;

  -- Status check
  if v_p.status = 'PICKED_UP' then
    return jsonb_build_object(
      'success', true,
      'status', 'PICKED_UP',
      'idempotent', true,
      'message', 'Already boarded'
    );
  end if;

  if v_p.status not in ('ACKNOWLEDGED', 'PENDING') then
    return jsonb_build_object(
      'success', false,
      'error', 'Cannot verify PIN in status ' || v_p.status::text
    );
  end if;

  -- Does this pickup have a PIN yet?
  if v_p.booking_pin is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Booking has not been accepted yet. Accept the pickup first.'
    );
  end if;

  -- PIN match?
  if v_p.booking_pin = trim(p_pin) then
    -- ✅ SUCCESS — verify boarding
    v_pickup_result := pickup_picked_up_workflow(
      p_pickup_id := p_pickup_id,
      p_driver_id := p_driver_id,
      p_seat_number := p_seat_number
    );

    if not (v_pickup_result->>'success')::boolean then
      -- pickup_picked_up_workflow failed for some reason
      return jsonb_build_object(
        'success', false,
        'error', 'PIN matched but boarding failed: ' || coalesce(v_pickup_result->>'error', 'unknown')
      );
    end if;

    -- Log the successful verification
    insert into booking_events (booking_id, event_type, payload)
    values (
      v_p.handoff_id,
      'pin_verified',
      jsonb_build_object(
        'pickup_id', p_pickup_id,
        'driver_id', p_driver_id,
        'seat_number', p_seat_number,
        'attempts_before_success', v_p.pin_attempts
      )
    );

    return jsonb_build_object(
      'success', true,
      'status', 'PICKED_UP',
      'passenger_count', v_p.passenger_count,
      'trip_passenger_count', (v_pickup_result->>'trip_passenger_count')::int
    );
  else
    -- ❌ WRONG PIN — increment attempts
    v_new_attempts := v_p.pin_attempts + 1;

    update pickup_notifications
    set pin_attempts = v_new_attempts,
        updated_at = now()
    where id = p_pickup_id;

    -- Log the failed attempt
    insert into booking_events (booking_id, event_type, payload)
    values (
      v_p.handoff_id,
      'pin_failed',
      jsonb_build_object(
        'pickup_id', p_pickup_id,
        'driver_id', p_driver_id,
        'attempt_number', v_new_attempts
      )
    );

    -- 3 strikes → NO_SHOW
    if v_new_attempts >= v_max_attempts then
      update pickup_notifications
      set status = 'MISSED',
          missed_at = now(),
          missed_reason = 'Max PIN attempts exceeded (' || v_max_attempts || ')',
          updated_at = now()
      where id = p_pickup_id;

      update booking_handoffs
      set status = 'NO_SHOW',
          no_show_at = now(),
          updated_at = now()
      where id = v_p.handoff_id;

      -- Log the escalation
      insert into booking_events (booking_id, event_type, payload)
      values (
        v_p.handoff_id,
        'no_show_pin_exhausted',
        jsonb_build_object(
          'pickup_id', p_pickup_id,
          'attempts', v_new_attempts
        )
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

comment on function public.driver_verify_pin is
  'Driver enters the PIN shown by the passenger. On match, calls pickup_picked_up_workflow. On 3 failures, marks NO_SHOW and releases capacity.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Verification
-- ═══════════════════════════════════════════════════════════════════════════

select 
  'driver_verify_pin' as function_name,
  exists (select 1 from pg_proc where proname='driver_verify_pin') as created;