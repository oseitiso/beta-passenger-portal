import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://hzmpncdygkeqvoszunfm.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Dedicated client for realtime (public — anon key)
const supabaseRealtime = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
    heartbeatIntervalMs: 30000,
    timeout: 20000,
  },
});

export type Unsubscribe = () => void;

export function subscribeToVehicleState(
  onChange: () => void,
  onStatus?: (status: string) => void
): Unsubscribe {
  const channel: RealtimeChannel = supabaseRealtime
    .channel("passenger_vehicle_current_state")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "vehicle_current_state",
      },
      () => {
        onChange();
      }
    )
    .subscribe((status) => {
      onStatus?.(status);
    });

  return () => {
    supabaseRealtime.removeChannel(channel);
  };
}