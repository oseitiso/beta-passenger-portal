"use client";

import { useEffect, useState, useCallback } from "react";
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
      <div className="flex h-full w-full items-center justify-center bg-neutral-900 rounded-lg">
        <div className="text-center text-neutral-400">
          <Bus className="mx-auto mb-2 h-8 w-8 animate-pulse" />
          <p className="text-sm">Loading map…</p>
        </div>
      </div>
    ),
  }
);

export default function MapPage() {
  const [buses, setBuses] = useState<PublicBus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBus, setSelectedBus] = useState<PublicBus | null>(null);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch — only render dynamic values after mount
  useEffect(() => {
    setMounted(true);
    setLastUpdated(new Date());
  }, []);

  const fetchBuses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getActiveBuses();
      setBuses(data);
      setLastUpdated(new Date());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load buses";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    fetchBuses();

    // Realtime — triggers a refetch whenever vehicle_current_state changes
    const unsubscribe = subscribeToVehicleState(
      () => {
        fetchBuses();
      },
      (status) => {
        if (status === "SUBSCRIBED") {
          console.log("[realtime] Subscribed to vehicle_current_state");
        }
        if (status === "CHANNEL_ERROR") {
          console.error("[realtime] Channel error");
        }
      }
    );

    // Auto-refresh every 30s as a safety net
    const interval = setInterval(fetchBuses, 30_000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [mounted, fetchBuses]);

  const filteredBuses = buses.filter((b) => {
    if (origin && b.route?.origin !== origin) return false;
    if (destination && b.route?.destination !== destination) return false;
    return true;
  });

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-600 text-white font-bold">
              B
            </div>
            <div>
              <div className="text-xs text-neutral-400">B-ETA</div>
              <div className="font-semibold">Live Buses</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Live
            </span>
            <span className="text-neutral-500">
              {mounted && lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString()}`
                : "—"}
            </span>
            <button
              onClick={fetchBuses}
              disabled={loading}
              className="rounded-lg border border-neutral-700 p-2 hover:bg-neutral-800 disabled:opacity-50"
              aria-label="Refresh"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <h1 className="mb-1 text-3xl font-bold">Live buses</h1>
        <p className="mb-4 text-sm text-neutral-400">
          {filteredBuses.length} bus{filteredBuses.length === 1 ? "" : "es"} on
          the road right now
        </p>

        {/* Filters */}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              FROM
            </label>
            <select
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
            >
              <option value="">Any origin</option>
              {BOTSWANA_LOCATIONS.map((loc) => (
                <option key={loc.name} value={loc.name}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              TO
            </label>
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
            >
              <option value="">Any destination</option>
              {BOTSWANA_LOCATIONS.map((loc) => (
                <option key={loc.name} value={loc.name}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Map container */}
        <div className="relative h-[600px] overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
          {error ? (
            <div className="flex h-full items-center justify-center text-red-400">
              <p>Error: {error}</p>
            </div>
          ) : (
            <PassengerMap
              buses={filteredBuses}
              selectedBusId={selectedBus?.trip_id ?? null}
              onSelectBus={setSelectedBus}
            />
          )}

          {/* Empty state overlay */}
          {!loading && !error && filteredBuses.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="pointer-events-auto rounded-xl bg-neutral-900/95 px-6 py-4 text-center shadow-xl border border-neutral-800">
                <Bus className="mx-auto mb-2 h-8 w-8 text-neutral-500" />
                <p className="font-semibold">No buses on the road</p>
                <p className="mt-1 text-xs text-neutral-400 max-w-xs">
                  There are no active trips right now. Check back later, or
                  clear filters if you've set any.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Detail drawer */}
      {selectedBus && (
        <BusDetailDrawer
          bus={selectedBus}
          onClose={() => setSelectedBus(null)}
        />
      )}
    </div>
  );
}