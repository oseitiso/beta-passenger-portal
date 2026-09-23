import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://hzmpncdygkeqvoszunfm.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_o2CPNKg49wAwJysjiGp08A_V0ZYeZjH";

if (typeof window !== "undefined") {
  console.log(
    "[supabase] URL length:",
    SUPABASE_URL.length,
    "| KEY length:",
    SUPABASE_ANON_KEY.length,
    "| key prefix:",
    SUPABASE_ANON_KEY.slice(0, 12)
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});