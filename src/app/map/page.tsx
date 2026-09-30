"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import {
  Bus,
  RefreshCw,
  Ticket,
  LocateFixed,
  Search,
  X,
  Loader2,
} from "lucide-react";
import {
  getActiveBuses,
  searchLocations,
  type PublicBus,
  type SearchedLocation,
} from "@/lib/passengerApi";
import { subscribeToVehicleState } from "@/lib/realtime";
import {
  BOTSWANA_LOCATIONS,
  type BotswanaLocation,
} from "@/lib/botswanaLocations";
import { BusDetailDrawer } from "@/components/map/BusDetailDrawer";
import { BusList } from "@/components/map/BusList";
import {
  FilterControls,
  type FilterMode,
} from "@/components/map/FilterControls";
import { BookingModal } from "@/components/booking/BookingModal";
import {
  getActiveBooking,
  getBookingStatus,
  cancelBooking,
  clearActiveBooking,
  appendBookingHistory,
  type BookingDetail,
} from "@/lib/passengerBookingApi";
import {
  logSearchSubmitted,
  logLocationSelected,
  logBusViewed,
} from "@/lib/events";

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

const SORTED_LOCATIONS: BotswanaLocation[] = [...BOTSWANA_LOCATIONS].sort(
  (a, b) => a.name.localeCompare(b.name)
);

const locationSearchCache = new Map<string, SearchedLocation[]>();

const SEARCH_DEBOUNCE_MS = 300;
const FILTER_DEBOUNCE_MS = 400;
const REALTIME_THROTTLE_MS = 3000;
const ENDED_BOOKING_LINGER_MS = 30_000;

function findNearestLocation(
  lat: number,
  lng: number
): BotswanaLocation | null {
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
  fallbackLocations: BotswanaLocation[];
  /** Which side of the journey this select represents — used for event payloads. */
  role: "from" | "to";
}

function LocationSelect({
  label,
  value,
  onChange,
  placeholder = "Any location",
  showLocateButton = false,
  fallbackLocations,
  role,
}: LocationSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchedLocation[]>([]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const searchTimerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

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

  useEffect(() => {
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);

    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    const cached = locationSearchCache.get(q.toLowerCase());
    if (cached) {
      setResults(cached);
      setSearching(false);
      return;
    }

    setSearching(true);
    const myRequestId = ++requestIdRef.current;

    searchTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await searchLocations(q);
        if (myRequestId !== requestIdRef.current) return;
        locationSearchCache.set(q.toLowerCase(), res);
        setResults(res);
        // Fire the event only for real server searches, and only on the
        // request that actually resolved.
        logSearchSubmitted(q, res.length);
      } catch (e) {
        if (myRequestId !== requestIdRef.current) return;
        console.warn("[LocationSelect] search failed:", e);
        setResults([]);
        logSearchSubmitted(q, 0);
      } finally {
        if (myRequestId === requestIdRef.current) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    };
  }, [query]);

  const fallbackFiltered = useMemo(() => {
    if (!query.trim()) return fallbackLocations;
    const q = query.trim().toLowerCase();
    return fallbackLocations.filter((l) => l.name.toLowerCase().includes(q));
  }, [fallbackLocations, query]);

  const handleLocate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nearest = findNearestLocation(
          pos.coords.latitude,
          pos.coords.longitude
        );
        setLocating(false);
        if (nearest) {
          onChange(nearest.name);
          setOpen(false);
          logLocationSelected(nearest.name, "my_location", role);
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

  const showServerResults = query.trim().length >= 2 && results.length > 0;
  const showSearching = query.trim().length >= 2 && searching;
  const showFallback = query.trim().length < 2 || results.length === 0;

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
        <div className="absolute left-0 right-0 z-[1100] mt-1 max-h-80 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950 shadow-2xl">
          <div className="border-b border-neutral-800 p-2">
            <div className="flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-neutral-500" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search any location…"
                className="flex-1 bg-transparent text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
              />
              {searching && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-400" />
              )}
              {query && !searching && (
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

          <div className="max-h-64 overflow-y-auto py-1">
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

            {showServerResults &&
              results.map((loc, idx) => (
                <button
                  key={`${loc.name}-${idx}`}
                  onClick={() => {
                    onChange(loc.name);
                    setOpen(false);
                    setQuery("");
                    logLocationSelected(loc.name, loc.source, role, idx);
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-neutral-900 ${
                    value === loc.name
                      ? "text-orange-400"
                      : "text-neutral-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{loc.name}</span>
                    {loc.region && (
                      <span className="flex-shrink-0 text-[10px] text-neutral-500">
                        {loc.region}
                      </span>
                    )}
                  </div>
                </button>
              ))}

            {showFallback &&
              fallbackFiltered.map((loc, idx) => (
                <button
                  key={loc.name}
                  onClick={() => {
                    onChange(loc.name);
                    setOpen(false);
                    setQuery("");
                    logLocationSelected(loc.name, "fallback", role, idx);
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-neutral-900 ${
                    value === loc.name
                      ? "text-orange-400"
                      : "text-neutral-200"
                  }`}
                >
                  {loc.name}
                  <span className="ml-2 text-xs text-neutral-500">
                    {loc.region}
                  </span>
                </button>
              ))}

            {showSearching && !showServerResults && !showFallback && (
              <div className="px-3 py-2 text-xs text-neutral-500">
                Searching…
              </div>
            )}

            {!showSearching &&
              !showServerResults &&
              !showFallback &&
              query.trim().length >= 2 && (
                <div className="px-3 py-2 text-xs text-neutral-500">
                  No locations match &quot;{query}&quot;
                </div>
              )}
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
  const [debouncedOrigin, setDebouncedOrigin] = useState("");
  const [debouncedDestination, setDebouncedDestination] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [mounted, setMounted] = useState(false);
  const [bookingBus, setBookingBus] = useState<PublicBus | null>(null);
  const [activeBooking, setActiveBooking] = useState<BookingDetail | null>(
    null
  );
  const [recentlyEndedBooking, setRecentlyEndedBooking] =
    useState<BookingDetail | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("dim");
  const [filterHovered, setFilterHovered] = useState(false);
  const [, setTick] = useState(0);

  const lastFetchRef = useRef<number>(0);
  const fetchRef = useRef<() => void>(() => {});

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedOrigin(origin);
      setDebouncedDestination(destination);
    }, FILTER_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [origin, destination]);

  const fetchBuses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getActiveBuses({
        from: debouncedOrigin || undefined,
        to: debouncedDestination || undefined,
      });
      setBuses(data);
      setLastUpdated(new Date());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load buses");
    } finally {
      setLoading(false);
    }
  }, [debouncedOrigin, debouncedDestination]);

  useEffect(() => {
    fetchRef.current = fetchBuses;
  }, [fetchBuses]);

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
          // ── Paper trail: log to history BEFORE clearing ──
          appendBookingHistory({
            handoff_id: result.booking.handoff_id,
            booking_reference: result.booking.booking_reference,
            handoff_status: result.booking.handoff_status,
            from_stop_name: result.booking.from_stop_name ?? null,
            to_stop_name: result.booking.to_stop_name ?? null,
            route_origin: result.booking.route_origin ?? null,
            route_destination: result.booking.route_destination ?? null,
            requested_seats: result.booking.requested_seats,
            passenger_name: result.booking.passenger_name ?? null,
            ended_at: Date.now(),
          });

          // ── Show an explainer banner for graceful endings ──
          // COMPLETED / EXPIRED linger in the receipt slot for a short
          // window so the passenger sees WHY the booking ended.
          // Hard-terminal states (CANCELLED / DECLINED / NO_SHOW) clear
          // the active slot immediately but still surface the ended banner.
          const isGracefulEnd =
            result.booking.handoff_status === "COMPLETED" ||
            result.booking.handoff_status === "EXPIRED";

          setRecentlyEndedBooking(result.booking);

          if (isGracefulEnd) {
            setActiveBooking(result.booking);
            setTimeout(() => {
              clearActiveBooking();
              setActiveBooking(null);
            }, ENDED_BOOKING_LINGER_MS);
          } else {
            clearActiveBooking();
            setActiveBooking(null);
          }
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
  }, [mounted, fetchBuses]);

  useEffect(() => {
    if (!mounted) return;

    refreshActiveBooking();

    const throttledFetch = () => {
      const now = Date.now();
      if (now - lastFetchRef.current < REALTIME_THROTTLE_MS) return;
      lastFetchRef.current = now;
      fetchRef.current();
      refreshActiveBooking();
    };

    const unsubscribe = subscribeToVehicleState(throttledFetch, (status) => {
      if (status === "SUBSCRIBED") {
        console.log("[realtime] Subscribed to vehicle_current_state");
      }
    });

    const interval = setInterval(() => {
      fetchRef.current();
      refreshActiveBooking();
    }, 15_000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [mounted, refreshActiveBooking]);

  const filterActive = Boolean(origin || destination);
  const filterIdle = !filterActive && !filterHovered;

  const handleSelectBus = (bus: PublicBus) => {
    setSelectedBus(bus);
    logBusViewed(bus.trip_id, bus.route?.route_id ?? null);
  };

  const handleCloseDetail = () => {
    setSelectedBus(null);
  };

  const handleCenter = (bus: PublicBus) => {
    // Center-on-map is an internal drawer action. It does not re-fire
    // bus_viewed — that would double-count a passenger who is already
    // looking at the same bus.
    setSelectedBus({ ...bus });
  };

  const handleOpenBooking = (bus: PublicBus) => {
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

    if (!bus.route.stops || bus.route.stops.length < 2) {
      alert(
        "This route does not have enough stops configured. Please contact support."
      );
      return;
    }

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
              buses={buses}
              selectedBusId={null}
              activeBooking={activeBooking}
              recentlyEndedBooking={recentlyEndedBooking}
              onSelectBus={handleSelectBus}
              onCancelBooking={handleCancelActiveBooking}
              loading={loading}
            />
          </aside>
        )}

        <main className="relative flex-1 overflow-hidden">
          <PassengerMap
            buses={buses}
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
                fallbackLocations={SORTED_LOCATIONS}
                role="from"
              />

              <div className="mt-2">
                <LocationSelect
                  label="TO"
                  value={destination}
                  onChange={setDestination}
                  placeholder="Any destination"
                  fallbackLocations={SORTED_LOCATIONS}
                  role="to"
                />
              </div>
            </div>

            <div
              className={`pointer-events-auto transition-opacity duration-300 ${
                filterIdle ? "opacity-60" : "opacity-100"
              }`}
            >
              <FilterControls
                visibleCount={buses.length}
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

      {bookingBus && bookingBus.route && bookingBus.route.stops.length >= 2 && (
        <BookingModal
          bus={bookingBus}
          routeStops={bookingBus.route.stops}
          onClose={() => setBookingBus(null)}
          onSuccess={handleBookingSuccess}
        />
      )}
    </div>
  );
}