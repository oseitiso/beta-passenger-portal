import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://hzmpncdygkeqvoszunfm.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// The vehicle_matched_tracks table does not exist in the B-ETA database yet.
// While this is false, the app never queries or subscribes to it (that was
// producing a 404 on every page load). Set it to true once the table is created.
const MATCHED_TRACKS_ENABLED = false;

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

export function subscribeToPassengerMapChanges(
  onVehicleStateChange: () => void,
  onMatchedTrackChange: (track: MatchedTrack | null, tripId?: string, vehicleId?: string) => void,
  onStatus?: (status: string) => void
): Unsubscribe {
  let builder = supabaseRealtime
    .channel("passenger_live_map")
    .on("postgres_changes", {
      event: "*", schema: "public", table: "vehicle_current_state",
    }, onVehicleStateChange);

  if (MATCHED_TRACKS_ENABLED) {
    builder = builder.on("postgres_changes", {
      event: "*", schema: "public", table: "vehicle_matched_tracks",
    }, (payload) => {
      const row = payload.new as MatchedTrack | undefined;
      const oldRow = payload.old as Partial<MatchedTrack> | undefined;
      onMatchedTrackChange(row ?? null, row?.trip_id ?? oldRow?.trip_id, row?.vehicle_id ?? oldRow?.vehicle_id);
    });
  }

  const channel = builder.subscribe((status) => onStatus?.(status));
  return () => { void supabaseRealtime.removeChannel(channel); };
}

export interface MatchedTrack {
  trip_id: string;
  vehicle_id: string;
  paths: [number, number][][];
  latest_latitude: number;
  latest_longitude: number;
  confidence: number;
  matched_at: string;
  source_recorded_at: string;
}

export async function getMatchedTracks(): Promise<MatchedTrack[]> {
  if (!MATCHED_TRACKS_ENABLED) return [];
  const { data, error } = await supabaseRealtime
    .from("vehicle_matched_tracks")
    .select("trip_id,vehicle_id,paths,latest_latitude,latest_longitude,confidence,matched_at,source_recorded_at");
  if (error) throw error;
  return (data ?? []) as MatchedTrack[];
}

export function subscribeToMatchedTracks(
  onChange: (track: MatchedTrack | null, tripId: string) => void
): Unsubscribe {
  if (!MATCHED_TRACKS_ENABLED) return () => {};
  const channel = supabaseRealtime
    .channel("passenger_vehicle_matched_tracks")
    .on("postgres_changes", {
      event: "*", schema: "public", table: "vehicle_matched_tracks",
    }, (payload) => {
      const row = payload.new as MatchedTrack | undefined;
      const oldRow = payload.old as Partial<MatchedTrack> | undefined;
      const tripId = row?.trip_id ?? oldRow?.trip_id;
      if (tripId) onChange(row ?? null, tripId);
    })
    .subscribe();
  return () => { void supabaseRealtime.removeChannel(channel); };
}