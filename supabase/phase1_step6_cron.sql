-- ============================================================================
-- B-ETA Booking Flow — Phase 1, Step 6: Expiry Cron
-- Auto-expires stale PENDING bookings every minute.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. expire_stale_bookings() — the function the cron calls
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
  -- Find all PENDING handoffs that have expired
  for v_rec in
    select id, trip_id
    from booking_handoffs
    where status = 'PENDING'
      and expires_at <= now()
    for update skip locked
  loop
    -- Mark handoff EXPIRED
    update booking_handoffs
    set status = 'EXPIRED',
        updated_at = now()
    where id = v_rec.id;
    v_expired_handoffs := v_expired_handoffs + 1;

    -- Update matching pickup_notifications (still PENDING → CANCELLED with auto flag)
    update pickup_notifications
    set status = 'CANCELLED',
        auto_cancelled = true,
        updated_at = now()
    where handoff_id = v_rec.id
      and status = 'PENDING';
    v_expired_pickups := v_expired_pickups + 1;

    -- Log the expiry
    insert into booking_events (booking_id, event_type, payload)
    values (
      v_rec.id,
      'expired_by_cron',
      jsonb_build_object(
        'trip_id', v_rec.trip_id,
        'expired_at', now()
      )
    );
  end loop;

  return jsonb_build_object(
    'success', true,
    'expired_handoffs', v_expired_handoffs,
    'expired_pickups', v_expired_pickups,
    'ran_at', now()
  );
end;
$function$;

comment on function public.expire_stale_bookings is
  'Marks PENDING bookings as EXPIRED after their expiry window. Releases capacity. Called by pg_cron every minute.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Ensure pg_cron is available
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Schedule the cron job — runs every minute
-- ═══════════════════════════════════════════════════════════════════════════

-- Unschedule any previous version
do $$
begin
  if exists (select 1 from cron.job where jobname = 'b-eta-expire-bookings') then
    perform cron.unschedule('b-eta-expire-bookings');
  end if;
end $$;

select cron.schedule(
  'b-eta-expire-bookings',
  '* * * * *',   -- every minute
  $$
  select public.expire_stale_bookings();
  $$
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Verification
-- ═══════════════════════════════════════════════════════════════════════════

select 
  'expire_stale_bookings()' as object_name,
  exists (select 1 from pg_proc where proname='expire_stale_bookings') as created
union all
select
  'pg_cron extension',
  exists (select 1 from pg_extension where extname='pg_cron')
union all
select
  'b-eta-expire-bookings job',
  exists (select 1 from cron.job where jobname='b-eta-expire-bookings');

-- Show the job details
select jobid, jobname, schedule, active
from cron.job
where jobname = 'b-eta-expire-bookings';