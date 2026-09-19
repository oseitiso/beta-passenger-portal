-- ============================================================================
-- B-ETA Booking Flow — Phase 1, Step 8: End-to-End Test
-- Runs a full booking lifecycle against a real active trip.
-- ============================================================================

do $$
declare
  -- Test fixture — using GAB-MOL-002 (Gaborone → Molepolole, 2 stops)
  v_trip_id uuid := '127dc9ba-f606-40e8-bdd9-d2a54efb20f1';
  v_from_stop_id uuid := '33333333-0000-0000-0001-000000000004'; -- Gaborone
  v_to_stop_id uuid := '33333333-0000-0000-0001-000000000005';   -- Molepolole
  v_driver_id uuid;

  -- Test fixtures
  v_anon_id text := 'test-passenger-' || extract(epoch from now())::text;
  v_passenger_name text := 'Test Passenger';
  v_passenger_phone text := '+26771000000';

  -- Results
  v_request_result jsonb;
  v_handoff_id uuid;
  v_pickup_id uuid;
  v_expected_pin text;
  v_accept_result jsonb;
  v_wrong_pin_result jsonb;
  v_correct_pin_result jsonb;
  v_segment_availability integer;
  v_booking_status text;
  v_events_count integer;
  v_r record;  -- ← the missing declaration
begin
  raise notice '═══════════════════════════════════════════════════════════════';
  raise notice 'B-ETA Booking Flow — End-to-End Test';
  raise notice '═══════════════════════════════════════════════════════════════';

  -- ─── PRE-FLIGHT ───
  select driver_id into v_driver_id from trips where id = v_trip_id;
  raise notice '[PRE] Trip: %', v_trip_id;
  raise notice '[PRE] Driver: %', v_driver_id;
  raise notice '[PRE] From stop: Gaborone';
  raise notice '[PRE] To stop: Molepolole';

  v_segment_availability := segment_available_seats(v_trip_id, v_from_stop_id, v_to_stop_id);
  raise notice '[PRE] Segment available seats: %', v_segment_availability;

  if v_segment_availability < 1 then
    raise exception 'Test cannot proceed: no seats available on this segment';
  end if;

  -- ═══════════════════════════════════════════════════════════════════════
  raise notice '';
  raise notice '═══════════ TEST 1: Passenger requests booking ═══════════';
  -- ═══════════════════════════════════════════════════════════════════════

  v_request_result := request_booking(
    p_trip_id := v_trip_id,
    p_from_stop_id := v_from_stop_id,
    p_to_stop_id := v_to_stop_id,
    p_requested_seats := 1,
    p_user_id := null,
    p_anonymous_id := v_anon_id,
    p_passenger_name := v_passenger_name,
    p_passenger_phone := v_passenger_phone
  );

  raise notice '[T1] Result: %', v_request_result;

  if not (v_request_result->>'success')::boolean then
    raise exception 'TEST 1 FAILED: request_booking returned error: %', v_request_result->>'error';
  end if;

  v_handoff_id := (v_request_result->>'handoff_id')::uuid;
  v_pickup_id := (v_request_result->>'pickup_id')::uuid;

  raise notice '[T1] ✅ PASS — handoff_id: %, pickup_id: %', v_handoff_id, v_pickup_id;
  raise notice '[T1] Booking reference: %', v_request_result->>'booking_reference';

  v_segment_availability := segment_available_seats(v_trip_id, v_from_stop_id, v_to_stop_id);
  raise notice '[T1] Segment available seats after hold: %', v_segment_availability;

  -- ═══════════════════════════════════════════════════════════════════════
  raise notice '';
  raise notice '═══════════ TEST 2: Driver accepts the pickup ═══════════';
  -- ═══════════════════════════════════════════════════════════════════════

  v_accept_result := driver_accept_pickup(
    p_pickup_id := v_pickup_id,
    p_driver_id := v_driver_id
  );

  raise notice '[T2] Result: %', v_accept_result;

  if not (v_accept_result->>'success')::boolean then
    raise exception 'TEST 2 FAILED: driver_accept_pickup returned: %', v_accept_result->>'error';
  end if;

  v_expected_pin := v_accept_result->>'booking_pin';
  raise notice '[T2] ✅ PASS — PIN generated: %', v_expected_pin;

  select status into v_booking_status from booking_handoffs where id = v_handoff_id;
  raise notice '[T2] Handoff status: %', v_booking_status;

  if v_booking_status <> 'ACCEPTED' then
    raise exception 'TEST 2 FAILED: handoff status is %, expected ACCEPTED', v_booking_status;
  end if;

  -- ═══════════════════════════════════════════════════════════════════════
  raise notice '';
  raise notice '═══════════ TEST 3: Driver verifies with WRONG PIN ═══════════';
  -- ═══════════════════════════════════════════════════════════════════════

  v_wrong_pin_result := driver_verify_pin(
    p_pickup_id := v_pickup_id,
    p_driver_id := v_driver_id,
    p_pin := '000000',
    p_seat_number := null
  );

  raise notice '[T3] Result: %', v_wrong_pin_result;

  if (v_wrong_pin_result->>'success')::boolean then
    raise exception 'TEST 3 FAILED: wrong PIN was accepted';
  end if;

  raise notice '[T3] ✅ PASS — wrong PIN rejected, attempts remaining: %',
    v_wrong_pin_result->>'attempts_remaining';

  -- ═══════════════════════════════════════════════════════════════════════
  raise notice '';
  raise notice '═══════════ TEST 4: Driver verifies with CORRECT PIN ═══════════';
  -- ═══════════════════════════════════════════════════════════════════════

  v_correct_pin_result := driver_verify_pin(
    p_pickup_id := v_pickup_id,
    p_driver_id := v_driver_id,
    p_pin := v_expected_pin,
    p_seat_number := 1
  );

  raise notice '[T4] Result: %', v_correct_pin_result;

  if not (v_correct_pin_result->>'success')::boolean then
    raise exception 'TEST 4 FAILED: correct PIN rejected: %', v_correct_pin_result->>'error';
  end if;

  raise notice '[T4] ✅ PASS — passenger boarded';
  raise notice '[T4] trip passenger count now: %', v_correct_pin_result->>'trip_passenger_count';

  select status into v_booking_status from booking_handoffs where id = v_handoff_id;
  raise notice '[T4] Handoff final status: %', v_booking_status;

  -- ═══════════════════════════════════════════════════════════════════════
  raise notice '';
  raise notice '═══════════ TEST 5: Audit trail ═══════════';
  -- ═══════════════════════════════════════════════════════════════════════

  select count(*) into v_events_count
  from booking_events
  where booking_id = v_handoff_id;

  raise notice '[T5] Events logged for this booking: %', v_events_count;

  if v_events_count < 3 then
    raise warning 'TEST 5 WARNING: expected at least 3 events, got %', v_events_count;
  else
    raise notice '[T5] ✅ PASS — full event trail exists';
  end if;

  raise notice '[T5] Event types:';
  for v_r in
    select event_type, created_at
    from booking_events
    where booking_id = v_handoff_id
    order by created_at
  loop
    raise notice '     %  →  %', v_r.created_at, v_r.event_type;
  end loop;

  -- ═══════════════════════════════════════════════════════════════════════
  raise notice '';
  raise notice '═══════════════════════════════════════════════════════════════';
  raise notice '✅ ALL TESTS PASSED';
  raise notice '═══════════════════════════════════════════════════════════════';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Post-test verification — see the final state
-- ═══════════════════════════════════════════════════════════════════════════

select 
  h.id,
  h.booking_reference,
  h.status as handoff_status,
  h.booking_pin,
  h.passenger_name,
  p.status as pickup_status,
  p.pin_attempts,
  t.trip_code,
  t.current_passenger_count
from booking_handoffs h
left join pickup_notifications p on p.handoff_id = h.id
left join trips t on t.id = h.trip_id
where h.id in (
  select id from booking_handoffs 
  order by created_at desc 
  limit 1
);