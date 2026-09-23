"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { Bus, RefreshCw, Ticket, LocateFixed, Search, X } from "lucide-react";
import {
  getActiveBuses,
  type PublicBus,
} from "@/lib/passengerApi";
import { subscribeToVehicleState } from "@/lib/realtime";
import { BOTSWANA_LOCATIONS, type BotswanaLocation } from "@/lib/botswanaLocations";
import { BusDetailDrawer } from "@/components/map/BusDetailDrawer";
import { BusList } from "@/components/map/BusList";
import { FilterControls, type FilterMode } from "@/components/map/FilterControls";
import { BookingModal } from "@/components/booking/BookingModal";
import {
  getActiveBooking,
  getBookingStatus,
  cancelBooking,
  clearActiveBooking,
  type BookingDetail,
} from "@/lib/passengerBookingApi";

const PassengerMap = dynamic(
  () =>
    import("@/components/map/PassengerMap").then((m) => ({
      default: m.PassengerMap,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-neutral-900">
        <div className="text-center text-neutral-400">
          <Bus className="mx-auto mb-2 h-8 w-8 animate-pulse" />
          <p className="text-sm">Loading map…</p>
        </div>
      </div>
    ),
  }
);

const SORTED_LOCATIONS: BotswanaLocation[] = [...BOTSWANA_LOCATIONS].sort((a, b) =>
  a.name.localeCompare(b.name)
);

// Normalize a location string for matching ("Gaborone Bus Rank" vs "Gaborone")
function normalizeLocation(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+bus\s+(rank|stop|station|terminus)$/i, "")
    .replace(/\s+(rank|station|terminus|stop)$/i, "")
    .trim();
}

function locationMatches(stopName: string, userPick: string): boolean {
  const a = normalizeLocation(stopName);
  const b = normalizeLocation(userPick);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function findNearestLocation(lat: number, lng: number): BotswanaLocation | null {
  if (!SORTED_LOCATIONS.length) return null;
  let best: BotswanaLocation | null = null;
  let bestDist = Infinity;
  for (const loc of SORTED_LOCATIONS) {
    const dLat = loc.lat - lat;
    const dLng = loc.lng - lng;
    const d = dLat * dLat + dLng * dLng;
    if (d < bestDist) {
      bestDist = d;
      best = loc;
    }
  }
  return best;
}

interface LocationSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  showLocateButton?: boolean;
  locations: BotswanaLocation[];
}

function LocationSelect({
  label,
  value,
  onChange,
  placeholder = "Any location",
  showLocateButton = false,
  locations,
}: LocationSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return locations;
    const q = query.trim().toLowerCase();
    return locations.filter((l) => l.name.toLowerCase().includes(q));
  }, [locations, query]);

  const handleLocate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nearest = findNearestLocation(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
        if (nearest) {
          onChange(nearest.name);
          setOpen(false);
        } else {
          alert("Could not find a nearby location.");
        }
      },
      (err) => {
        setLocating(false);
        alert(`Location error: ${err.message}`);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-medium text-neutral-400">{label}</label>
        {showLocateButton && (
          <button
            type="button"
            onClick={handleLocate}
            disabled={locating}
            className="flex items-center gap-1 rounded text-[10px] font-medium text-orange-400 transition-colors hover:text-orange-300 disabled:opacity-50"
            title="Use my current location"
          >
            {locating ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <LocateFixed className="h-3 w-3" />
            )}
            My location
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-left text-sm text-neutral-100 transition-colors hover:border-neutral-600"
      >
        <span className={value ? "text-neutral-100" : "text-neutral-500"}>
          {value || placeholder}
        </span>
        <Search className="h-3.5 w-3.5 text-neutral-500" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-[1100] mt-1 max-h-64 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950 shadow-2xl">
          <div className="border-b border-neutral-800 p-2">
            <div className="flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-neutral-500" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search locations…"
                className="flex-1 bg-transparent text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="text-neutral-500 hover:text-neutral-300"
                  aria-label="Clear"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto py-1">
            <button
              onClick={() => {
                onChange("");
                setOpen(false);
                setQuery("");
              }}
              className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-neutral-900 ${
                !value ? "text-orange-400" : "text-neutral-400"
              }`}
            >
              {placeholder}
            </button>

            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-neutral-500">
                No locations match "{query}"
              </div>
            )}

            {filtered.map((loc) => (
              <button
                key={loc.name}
                onClick={() => {
                  onChange(loc.name);
                  setOpen(false);
                  setQuery("");
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-neutral-900 ${
                  value === loc.name ? "text-orange-400" : "text-neutral-200"
                }`}
              >
                {loc.name}
                <span className="ml-2 text-xs text-neutral-500">
                  {loc.region}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MapPage() {
  const [buses, setBuses] = useState<PublicBus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBus, setSelectedBus] = useState<PublicBus | null>(null);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [mounted, setMounted] = useState(false);
  const [bookingBus, setBookingBus] = useState<PublicBus | null>(null);
  const [routeStops, setRouteStops] = useState<{ id: string; name: string }[]>([]);
  const [activeBooking, setActiveBooking] = useState<BookingDetail | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("dim");
  const [filterHovered, setFilterHovered] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchBuses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getActiveBuses();
      setBuses(data);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load buses");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshActiveBooking = useCallback(async () => {
    const stored = getActiveBooking();
    if (!stored?.booking_reference) {
      setActiveBooking(null);
      return;
    }
    try {
      const result = await getBookingStatus(stored.booking_reference);
      if (result.success && result.booking) {
        const terminalStatuses = [
          "CANCELLED",
          "EXPIRED",
          "DECLINED",
          "NO_SHOW",
          "COMPLETED",
        ];
        if (terminalStatuses.includes(result.booking.handoff_status)) {
          clearActiveBooking();
          setActiveBooking(null);
        } else {
          setActiveBooking(result.booking);
        }
      } else {
        setActiveBooking(null);
      }
    } catch {
      setActiveBooking(null);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    fetchBuses();
    refreshActiveBooking();

    const unsubscribe = subscribeToVehicleState(
      () => {
        fetchBuses();
        refreshActiveBooking();
      },
      (status) => {
        if (status === "SUBSCRIBED") {
          console.log("[realtime] Subscribed to vehicle_current_state");
        }
      }
    );

    const interval = setInterval(() => {
      fetchBuses();
      refreshActiveBooking();
    }, 15_000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [mounted, fetchBuses, refreshActiveBooking]);

  const filterActive = Boolean(origin || destination);
  const filterIdle = !filterActive && !filterHovered;

  const handleSelectBus = (bus: PublicBus) => {
    setSelectedBus(bus);
  };

  const handleCloseDetail = () => {
    setSelectedBus(null);
  };

  const handleCenter = (bus: PublicBus) => {
    setSelectedBus({ ...bus });
  };

  const handleOpenBooking = async (bus: PublicBus) => {
    if (activeBooking) {
      alert(
        `You already have an active booking (${activeBooking.booking_reference}). Cancel it first or wait for it to expire.`
      );
      return;
    }

    if (!bus.route?.route_id) {
      alert("This bus does not have a route assigned. Cannot book.");
      return;
    }

    // The passenger-api Edge Function already returns the complete, ordered
    // stop list for this route via `bus.route.stops` — including the real
    // stop names. It does this through a service-role Postgres connection
    // that bypasses RLS. If we tried to re-fetch stop names from the browser,
    // RLS on the `stops` table would filter out every operator-created stop
    // (they are created with is_public = false) and we'd be left rendering
    // "Unknown stop". So we use what the Edge Function already sent us.
    const stops = bus.route.stops ?? [];

    if (stops.length < 2) {
      alert(
        `Cannot book this bus.\n\n` +
          `Route: ${bus.route.name ?? "(unnamed)"}\n` +
          `Route ID: ${bus.route.route_id}\n` +
          `Route stops found: ${stops.length}`
      );
      return;
    }

    const formattedStops = stops
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        id: s.stop_id,
        name: s.name,
      }));

    setRouteStops(formattedStops);
    setBookingBus(bus);
  };

  const handleBookingSuccess = async () => {
    await refreshActiveBooking();
    setTimeout(() => {
      window.location.href = "/my-booking";
    }, 1500);
  };

  const handleCancelActiveBooking = async (handoffId: string) => {
    const result = await cancelBooking(handoffId);
    if (!result.success) {
      throw new Error(result.error ?? "Failed to cancel");
    }
    clearActiveBooking();
    setActiveBooking(null);
  };

  const secondsAgo = lastUpdated
    ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000)
    : null;

  // ── FILTER: match against route.stops (terminals + intermediate), with direction ──
  const sidebarBuses = useMemo(() => {
    if (!origin && !destination) return buses;

    return buses.filter((b) => {
      const stops = b.route?.stops ?? [];

      // Fallback: if the API didn't send stops, use the old terminal-only check
      if (stops.length === 0) {
        if (origin && b.route?.origin !== origin) return false;
        if (destination && b.route?.destination !== destination) return false;
        return true;
      }

      const findIndex = (pick: string): number => {
        // Fast path — exact match against route terminals
        if (b.route?.origin === pick) return 0;
        if (b.route?.destination === pick) return stops.length - 1;
        // Otherwise fuzzy-match against every stop name
        return stops.findIndex((s) => locationMatches(s.name, pick));
      };

      const fromIdx = origin ? findIndex(origin) : -1;
      const toIdx = destination ? findIndex(destination) : -1;

      if (origin && fromIdx === -1) return false;
      if (destination && toIdx === -1) return false;

      // Direction check: FROM must come before TO
      if (fromIdx !== -1 && toIdx !== -1 && fromIdx >= toIdx) return false;

      return true;
    });
  }, [buses, origin, destination]);

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-600 font-bold text-white">
            B
          </div>
          <div>
            <div className="text-xs text-neutral-400">B-ETA</div>
            <div className="font-semibold">Live Buses</div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <a
            href="/my-booking"
            className="hidden items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 sm:flex"
          >
            <Ticket className="h-3.5 w-3.5" />
            My Booking
          </a>
          <span className="hidden items-center gap-1.5 sm:flex">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            <span className="text-xs text-neutral-400">Live</span>
          </span>
          <button
            onClick={fetchBuses}
            disabled={loading}
            className="rounded-lg border border-neutral-700 p-2 hover:bg-neutral-800 disabled:opacity-50"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {!selectedBus && (
          <aside className="hidden w-80 flex-shrink-0 overflow-hidden border-r border-neutral-800 bg-neutral-950 lg:block">
            <BusList
              buses={sidebarBuses}
              selectedBusId={null}
              activeBooking={activeBooking}
              onSelectBus={handleSelectBus}
              onCancelBooking={handleCancelActiveBooking}
              loading={loading}
            />
          </aside>
        )}

        <main className="relative flex-1 overflow-hidden">
          <PassengerMap
            buses={sidebarBuses}
            selectedBusId={selectedBus?.trip_id ?? null}
            onSelectBus={handleSelectBus}
          />

          <div
            className="pointer-events-none absolute left-4 top-4 z-[1000] w-72 max-w-[calc(100%-2rem)] space-y-2"
            onMouseEnter={() => setFilterHovered(true)}
            onMouseLeave={() => setFilterHovered(false)}
          >
            <div
              className={`pointer-events-auto rounded-lg border border-neutral-800 bg-neutral-900/95 p-3 shadow-lg backdrop-blur transition-opacity duration-300 ${
                filterIdle ? "opacity-60" : "opacity-100"
              }`}
            >
              <LocationSelect
                label="FROM"
                value={origin}
                onChange={setOrigin}
                placeholder="Any origin"
                showLocateButton
                locations={SORTED_LOCATIONS}
              />

              <div className="mt-2">
                <LocationSelect
                  label="TO"
                  value={destination}
                  onChange={setDestination}
                  placeholder="Any destination"
                  locations={SORTED_LOCATIONS}
                />
              </div>
            </div>

            <div
              className={`pointer-events-auto transition-opacity duration-300 ${
                filterIdle ? "opacity-60" : "opacity-100"
              }`}
            >
              <FilterControls
                visibleCount={sidebarBuses.length}
                totalCount={buses.length}
                filterActive={filterActive}
                mode={filterMode}
                onModeChange={setFilterMode}
                onClear={() => {
                  setOrigin("");
                  setDestination("");
                }}
              />
            </div>
          </div>

          {secondsAgo !== null && (
            <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] rounded-full bg-neutral-900/90 px-3 py-1.5 text-xs text-neutral-400 backdrop-blur">
              Updated {secondsAgo}s ago
            </div>
          )}

          {error && (
            <div className="pointer-events-none absolute bottom-4 right-4 z-[1000] rounded-lg border border-red-900/50 bg-red-950/80 px-3 py-2 text-xs text-red-300 backdrop-blur">
              {error}
            </div>
          )}
        </main>

        {selectedBus && (
          <aside className="hidden w-96 flex-shrink-0 overflow-hidden border-l border-neutral-800 bg-neutral-950 lg:block">
            <BusDetailDrawer
              bus={selectedBus}
              onClose={handleCloseDetail}
              onCenter={handleCenter}
              onBookSeat={handleOpenBooking}
            />
          </aside>
        )}
      </div>

      {selectedBus && (
        <div className="absolute inset-x-0 bottom-0 z-[1100] lg:hidden">
          <BusDetailDrawer
            bus={selectedBus}
            onClose={handleCloseDetail}
            onCenter={handleCenter}
            onBookSeat={handleOpenBooking}
          />
        </div>
      )}

      {bookingBus && routeStops.length >= 2 && (
        <BookingModal
          bus={bookingBus}
          routeStops={routeStops}
          onClose={() => {
            setBookingBus(null);
            setRouteStops([]);
          }}
          onSuccess={handleBookingSuccess}
        />
      )}
    </div>
  );
}