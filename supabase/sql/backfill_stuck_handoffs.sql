-- Backfill stuck handoffs to match reality
-- 1. Passengers boarded but handoff was cancelled: mark COMPLETED
update public.booking_handoffs bh
set status = 'COMPLETED',
    picked_up_at = pn.picked_up_at,
    completed_at = coalesce(pn.alighted_at, now()),
    updated_at = now()
from public.pickup_notifications pn
where pn.handoff_id = bh.id
  and bh.status = 'CANCELLED'
  and pn.status = 'PICKED_UP';

-- 2. Passengers boarded but handoff is still PICKED_UP: mark COMPLETED
update public.booking_handoffs bh
set status = 'COMPLETED',
    picked_up_at = coalesce(bh.picked_up_at, pn.picked_up_at),
    completed_at = coalesce(pn.alighted_at, now()),
    updated_at = now()
from public.pickup_notifications pn
where pn.handoff_id = bh.id
  and bh.status = 'PICKED_UP'
  and pn.status in ('PICKED_UP', 'DROPPED_OFF');

-- 3. Verified: verify results
select
  bh.status as handoff_status,
  pn.status as pickup_status,
  count(*) as cnt
from public.booking_handoffs bh
left join public.pickup_notifications pn on pn.handoff_id = bh.id
group by bh.status, pn.status
order by bh.status, pn.status;