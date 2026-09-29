create or replace function public.auto_alight_check(
  p_trip_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_speed double precision
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_radius double precision := alight_radius_m(p_speed);
  v_row record;
  v_total_dropped integer := 0;
  v_total_pax integer := 0;
  v_new_count integer;
  v_vehicle_id uuid;
begin
  for v_row in
    select pn.id,
           pn.handoff_id,
           pn.passenger_count,
           pn.vehicle_id,
           pn.to_stop_id,
           s.lat as stop_lat,
           s.lng as stop_lng
    from pickup_notifications pn
    join stops s on s.id = pn.to_stop_id
    where pn.trip_id = p_trip_id
      and pn.status = 'PICKED_UP'
      and pn.alighted_at is null
      and s.lat is not null
      and s.lng is not null
      and haversine_m(p_lat, p_lng, s.lat, s.lng) <= v_radius
  loop
    -- Mark pickup DROPPED_OFF
    update pickup_notifications
      set status = 'DROPPED_OFF',
          alighted_at = now(),
          alighted_stop_id = v_row.to_stop_id,
          updated_at = now()
      where id = v_row.id
        and status = 'PICKED_UP';

    if found then
      v_total_dropped := v_total_dropped + 1;
      v_total_pax := v_total_pax + coalesce(v_row.passenger_count, 1);
      v_vehicle_id := v_row.vehicle_id;

      -- NEW: cascade to booking_handoffs
      update booking_handoffs
      set status = 'COMPLETED',
          completed_at = now(),
          updated_at = now()
      where id = v_row.handoff_id
        and status = 'PICKED_UP';
    end if;
  end loop;

  if v_total_pax > 0 then
    update trips
      set current_passenger_count = greatest(0, coalesce(current_passenger_count, 0) - v_total_pax),
          updated_at = now()
      where id = p_trip_id
      returning current_passenger_count into v_new_count;

    if v_vehicle_id is not null then
      update vehicle_current_state
        set passenger_count = coalesce(v_new_count, 0),
            updated_at = now()
        where vehicle_id = v_vehicle_id;
    end if;
  end if;

  return jsonb_build_object(
    'dropped_rows', v_total_dropped,
    'dropped_pax', v_total_pax,
    'current_passenger_count', coalesce(v_new_count, null)
  );
end;
$function$;