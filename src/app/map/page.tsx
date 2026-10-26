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
  BellRing,
} from "lucide-react";
import {
  getActiveBuses,
  searchLocations,
  type PublicBus,
  type PublicStop,
  type SearchedLocation,
} from "@/lib/passengerApi";
import { getMatchedTracks, subscribeToPassengerMapChanges, type MatchedTrack } from "@/lib/realtime";
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
  const [matchedTracks, setMatchedTracks] = useState<Record<string, MatchedTrack>>({});
  const [focusVersion, setFocusVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const busesWithMatchedTracks = useMemo(() => buses.map((bus) => {
    const track = matchedTracks[bus.trip_id];
    const sourceAt = track ? new Date(track.source_recorded_at).getTime() : NaN;
    const rawAt = bus.live?.last_position_at ? new Date(bus.live.last_position_at).getTime() : NaN;
    const recent = track && Number.isFinite(sourceAt) &&
      Date.now() - sourceAt < 90_000 &&
      (!Number.isFinite(rawAt) || rawAt - sourceAt < 90_000);
    return {
      ...bus,
      matched_track: recent && track.confidence >= 0.5
        ? { paths: track.paths, confidence: track.confidence, matched_at: track.matched_at, source_recorded_at: track.source_recorded_at }
        : null,
      map_position: recent && track.confidence >= 0.5
        ? { latitude: track.latest_latitude, longitude: track.latest_longitude, source: "road-matched" as const }
        : null,
    };
  }), [buses, matchedTracks]);
  const selectedBus = useMemo(
    () => selectedBusId
      ? busesWithMatchedTracks.find((b) => b.trip_id === selectedBusId) ?? null
      : null,
    [busesWithMatchedTracks, selectedBusId]
  );
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [debouncedOrigin, setDebouncedOrigin] = useState("");
  const [debouncedDestination, setDebouncedDestination] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [mounted, setMounted] = useState(false);
  const [bookingBus, setBookingBus] = useState<PublicBus | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("dim");
  const [filterHovered, setFilterHovered] = useState(false);
  const [, setTick] = useState(0);

  const [activeBooking, setActiveBooking] = useState<BookingDetail | null>(
    () => {
      if (typeof window === "undefined") return null;
      return null;
    }
  );
  const [recentlyEndedBooking, setRecentlyEndedBooking] =
    useState<BookingDetail | null>(null);

  const lastFetchRef = useRef<number>(0);
  const fetchRef = useRef<() => void>(() => {});

  const [arrivalAlert, setArrivalAlert] = useState<"approaching" | "arrived" | null>(null);
  const lastAlertRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeBooking || activeBooking.handoff_status !== "ACCEPTED") {
      setArrivalAlert(null);
      return;
    }
    const bus = buses.find((b) => b.trip_code === activeBooking.trip_code || b.trip_id === (activeBooking as any).trip_id);
    if (!bus || !bus.live?.latitude || !bus.live?.longitude) return;

    const fromStopId = activeBooking.from_stop_name
      ? bus.route?.stops.find((s) => s.name === activeBooking.from_stop_name)?.stop_id
      : null;

    const stop = bus.route?.stops.find((s) => s.stop_id === fromStopId || s.name === activeBooking.from_stop_name);
    if (!stop || !stop.lat || !stop.lng) return;

    const R = 6371;
    const dLat = (stop.lat - bus.live.latitude) * (Math.PI / 180);
    const dLng = (stop.lng - bus.live.longitude) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(bus.live.latitude * (Math.PI / 180)) * Math.cos(stop.lat * (Math.PI / 180)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const distanceKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (distanceKm <= 0.15) {
      if (lastAlertRef.current !== "arrived") {
        setArrivalAlert("arrived");
        lastAlertRef.current = "arrived";
        if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
      }
    } else if (distanceKm <= 1.0) {
      if (!lastAlertRef.current) {
        setArrivalAlert("approaching");
        lastAlertRef.current = "approaching";
        if ("vibrate" in navigator) navigator.vibrate(200);
      }
    } else {
      setArrivalAlert(null);
      lastAlertRef.current = null;
    }
  }, [buses, activeBooking]);

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

        const isDisrupted = result.booking.pickup_disruption_flag === true;

        if (
          terminalStatuses.includes(result.booking.handoff_status) ||
          isDisrupted
        ) {
          appendBookingHistory({
            handoff_id: result.booking.handoff_id,
            booking_reference: result.booking.booking_reference,
            handoff_status: isDisrupted
              ? "DISRUPTED"
              : result.booking.handoff_status,
            from_stop_name: result.booking.from_stop_name ?? null,
            to_stop_name: result.booking.to_stop_name ?? null,
            route_origin: result.booking.route_origin ?? null,
            route_destination: result.booking.route_destination ?? null,
            requested_seats: result.booking.requested_seats,
            passenger_name: result.booking.passenger_name ?? null,
            ended_at: Date.now(),
          });

          const isGracefulEnd =
            result.booking.handoff_status === "COMPLETED" ||
            result.booking.handoff_status === "EXPIRED";

          setRecentlyEndedBooking(result.booking);

          if (isGracefulEnd && !isDisrupted) {
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
    let cancelled = false;
    getMatchedTracks().then((rows: any[]) => {
      if (!cancelled) setMatchedTracks(Object.fromEntries(rows.map((row: any) => [row.trip_id, row])));
    }).catch((e: any) => console.warn("[gps-match] Could not load matched tracks", e));
    return () => { cancelled = true; };
  }, [mounted]);

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

    const applyMatchedTrackChange = (row: MatchedTrack | null, tripId?: string) => {
      if (!row || !tripId) {
        getMatchedTracks().then((rows: any[]) => setMatchedTracks(Object.fromEntries(rows.map((item: any) => [item.trip_id, item]))))
          .catch((e: any) => console.warn("[gps-match] Could not refresh matched tracks", e));
        return;
      }
      setMatchedTracks((current) => {
        const next = { ...current };
        for (const [existingTripId, item] of Object.entries(next)) {
          if (item.vehicle_id === row.vehicle_id) delete next[existingTripId];
        }
        next[tripId] = row;
        return next;
      });
    };

    const unsubscribe = subscribeToPassengerMapChanges(throttledFetch, applyMatchedTrackChange, (status: any) => {
      if (status === "SUBSCRIBED") {
        console.log("[realtime] Subscribed to passenger map updates");
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
    setSelectedBusId(bus.trip_id);
    setFocusVersion((version) => version + 1);
    logBusViewed(bus.trip_id, bus.route?.route_id ?? null);
  };

  const handleCloseDetail = () => {
    setSelectedBusId(null);
  };

  const handleCenter = (bus: PublicBus) => {
    setSelectedBusId(bus.trip_id);
    setFocusVersion((version) => version + 1);
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

  const bookedBus = useMemo(() => {
    if (!activeBooking) return null;
    return (
      buses.find(
        (b) =>
          b.trip_code === activeBooking.trip_code ||
          (activeBooking as any).trip_id === b.trip_id
      ) ?? null
    );
  }, [buses, activeBooking]);

  const bookedTripId = bookedBus?.trip_id ?? null;

  const bookedState: "accepted" | "picked_up" | null = useMemo(() => {
    if (!activeBooking) return null;
    if (activeBooking.handoff_status === "ACCEPTED") return "accepted";
    if (activeBooking.handoff_status === "PICKED_UP") return "picked_up";
    return null;
  }, [activeBooking]);

  // ─────────────────────────────────────────────────────────
  // GROUP STOPS BY FARE ZONE (operator-defined)
  // ─────────────────────────────────────────────────────────
  const groupedJourney = useMemo(() => {
    if (!bookedBus || !bookedBus.route?.stops) return null;

    const groups = new Map<string, PublicStop[]>();
    for (const stop of bookedBus.route.stops) {
      const zoneKey = stop.fare_zone != null
        ? `zone-${stop.fare_zone}`
        : (stop.city || stop.reverse_geocoded_name || stop.name);
      if (!groups.has(zoneKey)) groups.set(zoneKey, []);
      groups.get(zoneKey)!.push(stop);
    }

    const zones = Array.from(groups.entries())
      .map(([zoneKey, stops]) => {
        const validStops = stops.filter((s) => s.lat != null && s.lng != null);
        if (validStops.length === 0) return null;

        const lat = validStops.reduce((sum, s) => sum + s.lat!, 0) / validStops.length;
        const lng = validStops.reduce((sum, s) => sum + s.lng!, 0) / validStops.length;
        const minOrder = Math.min(...stops.map((s) => s.order));
        const isPassed = stops.every((s) => s.unboardable_reason === "bus_passed");

        const name = stops[0].city || stops[0].reverse_geocoded_name || stops[0].name;

        return { name, lat, lng, minOrder, isPassed };
      })
      .filter((z): z is { name: string; lat: number; lng: number; minOrder: number; isPassed: boolean } => z !== null);

    zones.sort((a, b) => a.minOrder - b.minOrder);

    return zones;
  }, [bookedBus]);

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

      {arrivalAlert && (
        <div className={`absolute left-1/2 top-20 z-[2000] flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white shadow-lg animate-bounce ${arrivalAlert === "arrived" ? "bg-green-600" : "bg-orange-600"}`}>
          <BellRing className="h-4 w-4" />
          {arrivalAlert === "arrived" ? "Bus is here! Wave it down." : "Bus approaching (1 km away)"}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {!selectedBus && (
          <aside className="hidden w-80 flex-shrink-0 overflow-hidden border-r border-neutral-800 bg-neutral-950 lg:block">
            <BusList
              buses={busesWithMatchedTracks}
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
            buses={busesWithMatchedTracks}
            selectedBusId={selectedBusId}
            onSelectBus={handleSelectBus}
            focusBus={selectedBus}
            focusVersion={focusVersion}
            bookedTripId={bookedTripId}
            bookedState={bookedState}
            groupedJourney={groupedJourney}
            bookedRouteStops={bookedBus?.route?.stops ?? null}
            boardingStopName={activeBooking?.from_stop_name ?? null}
            alightingStopName={activeBooking?.to_stop_name ?? null}
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
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={handleCloseDetail}
          />
          <div className="relative w-full max-w-sm h-[80vh] rounded-2xl overflow-hidden shadow-2xl border border-neutral-700/50">
            <BusDetailDrawer
              bus={selectedBus}
              onClose={handleCloseDetail}
              onCenter={handleCenter}
              onBookSeat={handleOpenBooking}
            />
          </div>
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