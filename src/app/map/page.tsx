"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Bus, RefreshCw } from "lucide-react";
import {
  getActiveBuses,
  type PublicBus,
} from "@/lib/passengerApi";
import { subscribeToVehicleState } from "@/lib/realtime";
import { BOTSWANA_LOCATIONS } from "@/lib/botswanaLocations";
import { BusDetailDrawer } from "@/components/map/BusDetailDrawer";

const PassengerMap = dynamic(
  () =>
    import("@/components/map/PassengerMap").then((m) => ({
      default: m.PassengerMap,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 h-[620px] flex items-center justify-center">
        <p className="text-neutral-500 text-sm">Loading map...</p>
      </div>
    ),
  }
);

export default function PassengerMapPage() {
  const [buses, setBuses] = useState<PublicBus[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PublicBus | null>(null);
  const [origin, setOrigin] = useState<string>("");
  const [destination, setDestination] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const data = await getActiveBuses();
      setBuses(data);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load buses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime + fallback polling
  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (pollTimer) return;
      pollTimer = setInterval(() => {
        load();
      }, 15_000);
    };

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const unsub = subscribeToVehicleState(
      () => {
        load();
      },
      (status) => {
        const connected = status === "SUBSCRIBED";
        setRealtimeConnected(connected);
        if (connected) stopPolling();
        else startPolling();
      }
    );

    // If realtime never connects, start polling after 3s
    const fallback = setTimeout(() => {
      if (!realtimeConnected) startPolling();
    }, 3000);

    return () => {
      clearTimeout(fallback);
      stopPolling();
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter buses based on origin + destination
  const filteredBuses = useMemo(() => {
    if (!origin && !destination) return buses;
    return buses.filter((b) => {
      const r = b.route;
      if (!r) return false;
      if (origin && r.origin !== origin) return false;
      if (destination && r.destination !== destination) return false;
      return true;
    });
  }, [buses, origin, destination]);

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#FF6B00]/15 flex items-center justify-center">
              <span className="text-[#FF6B00] font-black text-sm">B</span>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold">
                B-ETA
              </p>
              <p className="text-sm font-bold text-white">Live Buses</p>
            </div>
          </a>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  realtimeConnected ? "bg-green-500" : "bg-neutral-600"
                }`}
              />
              <span className="text-neutral-500">
                {realtimeConnected ? "Live" : "Polling"}
              </span>
            </div>
            {lastUpdated && (
              <span className="text-neutral-600 hidden md:inline">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={load}
              className="w-8 h-8 rounded-lg hover:bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white transition-colors"
              aria-label="Refresh"
            >
              <RefreshCw size={14} strokeWidth={2} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Page title + filter */}
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Live buses
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              {filteredBuses.length} bus
              {filteredBuses.length !== 1 ? "es" : ""} on the road right now
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-neutral-500 font-semibold mb-2">
                From
              </label>
              <select
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#FF6B00] transition-colors"
              >
                <option value="">Any origin</option>
                {BOTSWANA_LOCATIONS.map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-neutral-500 font-semibold mb-2">
                To
              </label>
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#FF6B00] transition-colors"
              >
                <option value="">Any destination</option>
                {BOTSWANA_LOCATIONS.map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-800 rounded-xl p-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 h-[620px] flex items-center justify-center">
            <p className="text-neutral-500 text-sm">Loading live buses...</p>
          </div>
        ) : filteredBuses.length === 0 ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 h-[620px] flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-neutral-800/60 flex items-center justify-center mx-auto mb-4">
                <Bus size={24} strokeWidth={1.5} className="text-neutral-500" />
              </div>
              <p className="text-white font-bold">No buses on the road</p>
              <p className="text-neutral-500 text-sm mt-2 max-w-md mx-auto">
                {buses.length === 0
                  ? "There are no active trips right now. Check back later, or clear filters if you've set any."
                  : "No buses match your filter. Try a different origin or destination."}
              </p>
            </div>
          </div>
        ) : (
          <PassengerMap buses={filteredBuses} onBusClick={setSelected} />
        )}
      </main>

      <BusDetailDrawer bus={selected} onClose={() => setSelected(null)} />
    </div>
  );
}