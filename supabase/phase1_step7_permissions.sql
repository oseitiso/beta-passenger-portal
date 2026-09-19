-- ============================================================================
-- B-ETA Booking Flow — Phase 1, Step 7: Function Permissions
-- Grants execute on new functions to service_role (used by Edge Functions).
-- Does NOT add RLS policies — we're keeping everything Edge-Function-based for PoC.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Grant execute on all our new functions to service_role
--    (This is redundant since service_role bypasses permissions anyway,
--    but documents the intent and future-proofs the design.)
-- ═══════════════════════════════════════════════════════════════════════════

grant execute on function public.generate_booking_reference() to service_role;
grant execute on function public.generate_booking_pin() to service_role;
grant execute on function public.build_passenger_identity(uuid, text) to service_role;
grant execute on function public.check_passenger_cooldown(text) to service_role;
grant execute on function public.request_booking(uuid, uuid, uuid, integer, uuid, text, text, text, integer) to service_role;
grant execute on function public.cancel_booking(uuid, uuid, text) to service_role;
grant execute on function public.driver_accept_pickup(uuid, uuid) to service_role;
grant execute on function public.driver_decline_pickup(uuid, uuid, text) to service_role;
grant execute on function public.driver_verify_pin(uuid, uuid, text, integer) to service_role;
grant execute on function public.mark_seat_will_free(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.clear_seat_mark(uuid, uuid, text) to service_role;
grant execute on function public.get_active_seat_marks(uuid) to service_role;
grant execute on function public.expire_stale_bookings() to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Revoke execute from PUBLIC and anon (default safe posture)
--    Only service_role can call these via REST. Edge Functions use service_role.
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function public.request_booking(uuid, uuid, uuid, integer, uuid, text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.cancel_booking(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.driver_accept_pickup(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.driver_decline_pickup(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.driver_verify_pin(uuid, uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.mark_seat_will_free(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.clear_seat_mark(uuid, uuid, text) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Verify RLS state on all our tables
-- ═══════════════════════════════════════════════════════════════════════════

select
  t.tablename as table_name,
  t.rowsecurity as rls_enabled,
  coalesce(p.policy_count, 0) as policy_count
from pg_tables t
left join (
  select schemaname, tablename, count(*) as policy_count
  from pg_policies
  group by schemaname, tablename
) p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
  and t.tablename in (
    'driver_seat_marks',
    'passenger_cancellation_log',
    'booking_handoffs',
    'pickup_notifications',
    'booking_events',
    'trip_walkup_passengers'
  )
order by t.tablename;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Verify our new functions exist and are owned properly
-- ═══════════════════════════════════════════════════════════════════════════

select
  proname as function_name,
  prosecdef as security_definer,
  pg_get_userbyid(proowner) as owner
from pg_proc
where proname in (
  'request_booking',
  'cancel_booking',
  'driver_accept_pickup',
  'driver_decline_pickup',
  'driver_verify_pin',
  'mark_seat_will_free',
  'clear_seat_mark',
  'get_active_seat_marks',
  'expire_stale_bookings'
)
order by proname;