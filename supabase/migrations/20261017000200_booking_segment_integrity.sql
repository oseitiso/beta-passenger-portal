-- Enforce route direction and live bus position at booking submission.
create or replace function public.is_segment_bookable(
  p_trip_id uuid,
  p_from_lat numeric,
  p_from_lng numeric,
  p_to_lat numeric,
  p_to_lng numeric
)
returns jsonb
language plpgsql
stable
as $function$
declare
  v_route_id uuid;
  v_polyline_geom geometry;
  v_total_km numeric;
  v_bus_lat numeric;
  v_bus_lng numeric;
  v_bus_speed numeric;
  v_bus_distance_km numeric;
  v_from_distance_km numeric;
  v_to_distance_km numeric;
  v_km_ahead numeric;
  v_eta_minutes numeric;
begin
  select t.route_id, r.polyline_geom,
         ST_Length(r.polyline_geom::geography) / 1000,
         vcs.latitude, vcs.longitude, vcs.speed_kph
    into v_route_id, v_polyline_geom, v_total_km,
         v_bus_lat, v_bus_lng, v_bus_speed
    from public.trips t
    join public.routes r on r.id = t.route_id
    left join public.vehicle_current_state vcs on vcs.vehicle_id = t.vehicle_id
   where t.id = p_trip_id;

  if v_route_id is null or v_polyline_geom is null then
    return jsonb_build_object('bookable', false, 'reason', 'no_route_or_polyline');
  end if;
  if v_bus_lat is null or v_bus_lng is null then
    return jsonb_build_object('bookable', false, 'reason', 'no_bus_position');
  end if;

  v_bus_distance_km := ROUND((
    ST_LineLocatePoint(
      v_polyline_geom,
      ST_SetSRID(ST_MakePoint(v_bus_lng, v_bus_lat), 4326)
    ) * v_total_km
  )::numeric, 2);

  v_from_distance_km := ROUND((
    ST_LineLocatePoint(
      v_polyline_geom,
      ST_SetSRID(ST_MakePoint(p_from_lng, p_from_lat), 4326)
    ) * v_total_km
  )::numeric, 2);

  v_to_distance_km := ROUND((
    ST_LineLocatePoint(
      v_polyline_geom,
      ST_SetSRID(ST_MakePoint(p_to_lng, p_to_lat), 4326)
    ) * v_total_km
  )::numeric, 2);

  if v_from_distance_km >= v_to_distance_km then
    return jsonb_build_object('bookable', false, 'reason', 'wrong_direction',
      'bus_km', v_bus_distance_km, 'from_km', v_from_distance_km, 'to_km', v_to_distance_km);
  end if;
  if v_bus_distance_km >= v_from_distance_km then
    return jsonb_build_object('bookable', false, 'reason', 'bus_passed_boarding_stop',
      'bus_km', v_bus_distance_km, 'from_km', v_from_distance_km);
  end if;

  v_km_ahead := v_from_distance_km - v_bus_distance_km;
  if v_bus_speed is null or v_bus_speed < 5 then v_bus_speed := 60; end if;
  v_eta_minutes := ROUND((v_km_ahead / v_bus_speed * 60)::numeric, 1);
  if v_eta_minutes < 5 then
    return jsonb_build_object('bookable', false, 'reason', 'too_close',
      'eta_minutes', v_eta_minutes, 'bus_km', v_bus_distance_km, 'from_km', v_from_distance_km);
  end if;

  return jsonb_build_object('bookable', true, 'bus_km', v_bus_distance_km,
    'from_km', v_from_distance_km, 'to_km', v_to_distance_km,
    'km_ahead', ROUND(v_km_ahead::numeric, 2), 'eta_minutes', v_eta_minutes,
    'route_length_km', ROUND(v_total_km::numeric, 2));
end;
$function$;

revoke all on function public.is_segment_bookable(uuid, numeric, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.is_segment_bookable(uuid, numeric, numeric, numeric, numeric) to service_role;

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
  v_from_lat numeric;
  v_from_lng numeric;
  v_to_lat numeric;
  v_to_lng numeric;
  v_last_position_at timestamptz;
  v_segment_check jsonb;
begin
  v_identity := build_passenger_identity(p_user_id, p_anonymous_id);
  if v_identity is null then
    return jsonb_build_object('success', false, 'error', 'Missing passenger identity');
  end if;

  select h.id as handoff_id, h.booking_reference, h.status, h.expires_at
    into v_active_booking
    from public.booking_handoffs h
   where h.status in ('PENDING', 'ACCEPTED')
     and h.expires_at > now()
     and ((h.user_id is not null and h.user_id = p_user_id)
       or (h.anonymous_id is not null and h.anonymous_id = p_anonymous_id))
   order by h.created_at desc
   limit 1;
  if v_active_booking.handoff_id is not null then
    return jsonb_build_object('success', false,
      'error', 'You already have an active booking. Cancel it first or wait for it to expire.',
      'active_booking', jsonb_build_object('handoff_id', v_active_booking.handoff_id,
        'booking_reference', v_active_booking.booking_reference,
        'status', v_active_booking.status, 'expires_at', v_active_booking.expires_at));
  end if;

  v_cooldown := check_passenger_cooldown(v_identity);
  if not (v_cooldown->>'allowed')::boolean then
    return jsonb_build_object('success', false, 'error', 'Passenger is in cooldown', 'cooldown', v_cooldown);
  end if;

  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then return jsonb_build_object('success', false, 'error', 'Trip not found'); end if;
  if v_trip.status <> 'IN_PROGRESS' then
    return jsonb_build_object('success', false, 'error', 'Trip is not in progress');
  end if;
  v_driver_id := v_trip.driver_id;

  select fs.lat, fs.lng into v_from_lat, v_from_lng
    from public.route_stops rs join public.stops fs on fs.id = rs.stop_id
   where rs.route_id = v_trip.route_id and rs.stop_id = p_from_stop_id;
  if not found then return jsonb_build_object('success', false, 'error', 'Boarding stop not on route'); end if;
  select ts.lat, ts.lng into v_to_lat, v_to_lng
    from public.route_stops rs join public.stops ts on ts.id = rs.stop_id
   where rs.route_id = v_trip.route_id and rs.stop_id = p_to_stop_id;
  if not found then return jsonb_build_object('success', false, 'error', 'Destination stop not on route'); end if;
  if p_from_stop_id = p_to_stop_id then
    return jsonb_build_object('success', false, 'error', 'From and to stops must differ');
  end if;
  if v_from_lat is null or v_from_lng is null or v_to_lat is null or v_to_lng is null then
    return jsonb_build_object('success', false, 'error', 'Stops are missing coordinates', 'reason', 'stop_coordinates_missing');
  end if;

  select vcs.last_position_at into v_last_position_at
    from public.vehicle_current_state vcs where vcs.vehicle_id = v_trip.vehicle_id;
  if v_last_position_at is null or v_last_position_at < now() - interval '5 minutes' then
    return jsonb_build_object('success', false, 'error', 'Bus location is stale; try again when it updates', 'reason', 'bus_position_stale');
  end if;

  v_segment_check := public.is_segment_bookable(
    p_trip_id, v_from_lat, v_from_lng, v_to_lat, v_to_lng
  );
  if coalesce((v_segment_check->>'bookable')::boolean, false) is not true then
    return jsonb_build_object('success', false,
      'error', 'Trip cannot currently serve this segment',
      'reason', v_segment_check->>'reason',
      'segment_check', v_segment_check);
  end if;

  v_result := public.create_handoff_reservation_workflow(
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
  if not (v_result->>'success')::boolean then return v_result; end if;

  v_handoff_id := (v_result->>'handoff_id')::uuid;
  v_token := v_result->>'token';
  update public.booking_handoffs set expires_at = v_expires_10min,
    expires_reason = 'driver_acceptance_window_10min' where id = v_handoff_id;
  v_booking_reference := generate_booking_reference();
  update public.booking_handoffs set booking_reference = v_booking_reference where id = v_handoff_id;

  insert into public.pickup_notifications (
    trip_id, vehicle_id, driver_id, from_stop_id, to_stop_id,
    handoff_id, operator_id, passenger_count, booking_reference,
    passenger_name, passenger_phone, status, expires_at
  ) values (
    p_trip_id, v_trip.vehicle_id, v_driver_id, p_from_stop_id, p_to_stop_id,
    v_handoff_id, v_trip.operator_id, p_requested_seats, v_booking_reference,
    p_passenger_name, p_passenger_phone, 'PENDING', v_expires_10min
  ) returning id into v_pickup_id;

  insert into public.booking_events (booking_id, trip_id, event_type, actor_type, actor_id, metadata)
  values (v_handoff_id, p_trip_id, 'requested', 'passenger', v_identity,
    jsonb_build_object('from_stop_id', p_from_stop_id, 'to_stop_id', p_to_stop_id,
      'seats', p_requested_seats, 'pickup_id', v_pickup_id));

  return jsonb_build_object('success', true, 'handoff_id', v_handoff_id,
    'pickup_id', v_pickup_id, 'token', v_token,
    'booking_reference', v_booking_reference, 'expires_at', v_expires_10min, 'status', 'PENDING');
end;
$function$;

revoke all on function public.request_booking(uuid, uuid, uuid, integer, uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.request_booking(uuid, uuid, uuid, integer, uuid, text, text, text, integer) to service_role;