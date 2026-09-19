-- ============================================================================
-- B-ETA Live Movement Simulation
-- Schedules a job that moves every IN_TRANSIT bus every 5 seconds.
-- To stop: select cron.unschedule('b-eta-bus-sim');
-- ============================================================================

-- 1. Ensure pg_cron is available
create extension if not exists pg_cron;

-- 2. Unschedule any previous job with the same name (safe re-run)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'b-eta-bus-sim') then
    perform cron.unschedule('b-eta-bus-sim');
  end if;
end $$;

-- 3. Schedule the movement job
select cron.schedule(
  'b-eta-bus-sim',
  '5 seconds',
  $$
  update public.vehicle_current_state vcs
  set 
    latitude = vcs.latitude + (random() - 0.5) * 0.01,
    longitude = vcs.longitude + (random() - 0.5) * 0.01,
    speed_kph = 60 + floor(random() * 30),
    heading = floor(random() * 360),
    last_position_at = now(),
    updated_at = now()
  from public.trips t
  where vcs.vehicle_id = t.vehicle_id
    and t.status = 'IN_PROGRESS'
    and vcs.status = 'IN_TRANSIT';
  $$
);

-- 4. Verify the job is active
select 
  jobid, 
  jobname, 
  schedule, 
  active,
  command
from cron.job 
where jobname = 'b-eta-bus-sim';