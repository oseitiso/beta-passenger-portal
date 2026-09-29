create or replace function public.project_point_onto_route(
  p_route_id uuid,
  p_lat numeric,
  p_lng numeric
)
returns numeric
language sql
stable
security definer
set search_path = 'public'
as $$
  select
    case
      when r.polyline_geom is null then null
      else
        ST_LineLocatePoint(
          r.polyline_geom,
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
        ) * (ST_Length(r.polyline_geom::geography) / 1000.0)
    end
  from routes r
  where r.id = p_route_id;
$$;

comment on function public.project_point_onto_route is
  'Projects (lat,lng) onto the route polyline and returns km from origin. Null if route has no polyline.';
create or replace function public.mark_stop_zone_passed(
  p_trip_id uuid,
  p_stop_ids uuid[],
  p_driver_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_updated integer := 0;
  v_booking record;
  v_trip record;
begin
  select id, driver_id, status
  into v_trip
  from trips
  where id = p_trip_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Trip not found');
  end if;

  if v_trip.driver_id <> p_driver_id then
    return jsonb_build_object('success', false, 'error', 'Not your trip');
  end if;

  if v_trip.status <> 'IN_PROGRESS' then
    return jsonb_build_object(
      'success', false,
      'error', 'Trip is not IN_PROGRESS (status: ' || v_trip.status::text || ')'
    );
  end if;

  if p_stop_ids is null or array_length(p_stop_ids, 1) is null then
    return jsonb_build_object('success', false, 'error', 'stop_ids is empty');
  end if;

  for v_booking in
    select
      h.id as handoff_id,
      h.booking_reference,
      h.from_stop_id,
      s.name as from_stop_name
    from booking_handoffs h
    join stops s on s.id = h.from_stop_id
    where h.trip_id = p_trip_id
      and h.from_stop_id = any(p_stop_ids)
      and h.status = 'ACCEPTED'
    for update
  loop
    update booking_handoffs
    set status = 'NO_SHOW',
        no_show_at = now(),
        updated_at = now()
    where id = v_booking.handoff_id;

    update pickup_notifications
    set status = 'MISSED',
        missed_at = now(),
        missed_reason = 'bus_left_stop_zone',
        updated_at = now()
    where handoff_id = v_booking.handoff_id
      and status in ('PENDING', 'ACKNOWLEDGED');

    insert into booking_events (
      booking_id, trip_id, event_type, actor_type, actor_id, metadata
    ) values (
      v_booking.handoff_id,
      p_trip_id,
      'no_show_zone_passed',
      'system',
      p_driver_id::text,
      jsonb_build_object(
        'reason', 'bus_left_stop_zone',
        'from_stop_id', v_booking.from_stop_id,
        'from_stop_name', v_booking.from_stop_name,
        'zone_stop_ids', to_jsonb(p_stop_ids)
      )
    );

    v_updated := v_updated + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'bookings_marked_no_show', v_updated,
    'zone_stop_ids', to_jsonb(p_stop_ids)
  );
end;
$function$;

comment on function public.mark_stop_zone_passed is
  'Marks ACCEPTED bookings as NO_SHOW when the driver reports the bus has passed a stop zone by 1 km. Idempotent.';