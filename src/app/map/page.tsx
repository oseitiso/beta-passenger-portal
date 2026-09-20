"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Bus, RefreshCw, List, X, Route as RouteIcon, Ticket } from "lucide-react";
import { getActiveBuses, type PublicBus } from "@/lib/passengerApi";
import {
  getRoutesWithPolylines,
  getStops,
  type PublicRouteShape,
  type PublicStopShape,
} from "@/lib/routesApi";
import { subscribeToVehicleState } from "@/lib/realtime";
import { BusDetailDrawer } from "@/components/map/BusDetailDrawer";
import { BusList } from "@/components/map/BusList";
import { LocationCombobox } from "@/components/map/LocationCombobox";
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
      <div className="flex h-full w-full items-center justify-center bg-neutral-900">
        <div className="text-center text-neutral-400">
          <Bus className="mx-auto mb-2 h-8 w-8 animate-pulse" />
          <p className="text-sm">Loading map…</p>
        </div>
      </div>
    ),
  }
);

export default function MapPage() {
  const router = useRouter();
  const [buses, setBuses] = useState<PublicBus[]>([]);
  const [routes, setRoutes] = useState<PublicRouteShape[]>([]);
  const [stops, setStops] = useState<PublicStopShape[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBus, setSelectedBus] = useState<PublicBus | null>(null);
  const [focusBus, setFocusBus] = useState<PublicBus | null>(null);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("hide");
  const [showRoutes, setShowRoutes] = useState(true);
  const [showStops, setShowStops] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bookingBus, setBookingBus] = useState<PublicBus | null>(null);
  const [activeBooking, setActiveBooking] = useState<BookingDetail | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    setMounted(true);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
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
    let cancelled = false;
    (async () => {
      try {
        const [routesData, stopsData] = await Promise.all([
          getRoutesWithPolylines(),
          getStops(),
        ]);
        if (!cancelled) {
          setRoutes(routesData);
          setStops(stopsData);
        }
      } catch (e) {
        console.error("[map] Failed to load routes/stops", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted]);

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
        if (status === "CHANNEL_ERROR") {
          console.error("[realtime] Channel error");
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

  const matchingBusIds = useMemo(() => {
    const set = new Set<string>();
    const originLower = origin.trim().toLowerCase();
    const destinationLower = destination.trim().toLowerCase();

    const findStopOrder = (needle: string): number | null => {
      if (!needle) return null;
      for (const b of buses) {
        const stops = b.route?.stops ?? [];
        for (const s of stops) {
          if (typeof s.order !== "number") continue;
          const haystack = String(s.name || "") + " " + String(s.city || "");
          if (haystack.toLowerCase().includes(needle)) return s.order;
        }
      }
      return null;
    };

    for (const b of buses) {
      const routeStops = b.route?.stops ?? [];

      const findOrderInBus = (needle: string): number | null => {
        if (!needle) return null;
        for (const s of routeStops) {
          if (typeof s.order !== "number") continue;
          const haystack = (String(s.name || "") + " " + String(s.city || "")).toLowerCase();
          if (haystack.includes(needle)) return s.order;
        }
        return null;
      };

      const fromOrder = findOrderInBus(originLower);
      const toOrder = findOrderInBus(destinationLower);

      let ok = true;
      if (originLower && fromOrder === null) ok = false;
      if (ok && destinationLower && toOrder === null) ok = false;
      if (ok && originLower && destinationLower && fromOrder !== null && toOrder !== null) {
        if (fromOrder >= toOrder) ok = false;
      }
      if (ok) set.add(b.trip_id);
    }
    return set;
  }, [buses, origin, destination]);

  const visibleBuses = useMemo(() => {
    if (!filterActive) return buses;
    if (filterMode === "dim") return buses;
    return buses.filter((b) => matchingBusIds.has(b.trip_id));
  }, [buses, filterActive, filterMode, matchingBusIds]);

  const sidebarBuses = useMemo(() => {
    if (!filterActive) return buses;
    return buses.filter((b) => matchingBusIds.has(b.trip_id));
  }, [buses, filterActive, matchingBusIds]);

  const clearFilters = () => {
    setOrigin("");
    setDestination("");
  };

  const handleSelectBus = (bus: PublicBus) => {
    setSelectedBus(bus);
    setFocusBus(bus);
    setSidebarOpen(false);
  };

  const handleCloseDetail = () => {
    setSelectedBus(null);
    setFocusBus(null);
    setSidebarOpen(true);
  };

  const handleCenter = (bus: PublicBus) => {
    setFocusBus({ ...bus });
  };

  const handleOpenBooking = (bus: PublicBus) => {
    if (activeBooking) {
      alert(
        `You already have an active booking (${activeBooking.booking_reference}). Cancel it first or wait for it to expire.`
      );
      return;
    }
    setBookingBus(bus);
  };

  const handleBookingSuccess = async () => {
    await refreshActiveBooking();
    setTimeout(() => {
      router.push("/my-booking");
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
    : 0;
  const agoLabel =
    secondsAgo < 5
      ? "just now"
      : secondsAgo < 60
      ? `${secondsAgo}s ago`
      : `${Math.floor(secondsAgo / 60)}m ago`;

  const layoutKey = `${sidebarOpen ? "S" : "H"}-${selectedBus ? "D" : "N"}`;
  const selectedBusId = selectedBus?.trip_id ?? null;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-neutral-950">
      <header className="flex-shrink-0 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600 text-sm font-bold text-white">
              B
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-neutral-400">
                B-ETA
              </div>
              <div className="text-sm font-semibold leading-tight">
                Live Buses
              </div>
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
            <span className="text-xs text-neutral-500">
              {mounted && lastUpdated ? `Updated ${agoLabel}` : "—"}
            </span>
            <button
              onClick={fetchBuses}
              disabled={loading}
              className="rounded-lg border border-neutral-700 p-1.5 hover:bg-neutral-800 disabled:opacity-50"
              aria-label="Refresh"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-shrink-0 border-b border-neutral-800 bg-neutral-950 px-4 py-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LocationCombobox
            label="FROM"
            placeholder="Where are you?"
            value={origin}
            onChange={setOrigin}
            enableGeolocation
          />
          <LocationCombobox
            label="TO"
            placeholder="Where to?"
            value={destination}
            onChange={setDestination}
          />
        </div>
      </div>

      <div className="flex-shrink-0 border-b border-neutral-800 bg-neutral-950 px-4 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <FilterControls
            visibleCount={matchingBusIds.size}
            totalCount={buses.length}
            filterActive={filterActive}
            mode={filterMode}
            onModeChange={setFilterMode}
            onClear={clearFilters}
          />

          <div className="ml-auto flex items-center gap-2 text-xs">
            <button
              onClick={() => setShowRoutes((v) => !v)}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors ${
                showRoutes
                  ? "border-orange-600/50 bg-orange-600/10 text-orange-400"
                  : "border-neutral-700 text-neutral-500 hover:bg-neutral-800"
              }`}
              title="Toggle route lines"
            >
              <RouteIcon className="h-3 w-3" />
              Routes
            </button>
            <button
              onClick={() => setShowStops((v) => !v)}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors ${
                showStops
                  ? "border-orange-600/50 bg-orange-600/10 text-orange-400"
                  : "border-neutral-700 text-neutral-500 hover:bg-neutral-800"
              }`}
              title="Toggle stop markers"
            >
              <span className="h-2 w-2 rounded-full bg-current" />
              Stops
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && selectedBus === null && (
          <aside className="hidden w-80 flex-shrink-0 overflow-hidden border-r border-neutral-800 bg-neutral-950 lg:block">
            <BusList
              buses={sidebarBuses}
              selectedBusId={selectedBusId}
              activeBooking={activeBooking}
              onSelectBus={handleSelectBus}
              onCancelBooking={handleCancelActiveBooking}
              loading={loading}
            />
          </aside>
        )}

        <div className="relative min-h-0 min-w-0 flex-1">
          {error ? (
            <div className="flex h-full items-center justify-center text-red-400">
              <p>Error: {error}</p>
            </div>
          ) : (
            <PassengerMap
              buses={visibleBuses}
              routes={routes}
              stops={stops}
              matchingBusIds={matchingBusIds}
              selectedBusId={selectedBusId}
              onSelectBus={handleSelectBus}
              focusBus={focusBus}
              layoutKey={layoutKey}
              dimNonMatching={filterMode === "dim"}
              showRoutes={showRoutes}
              showStops={showStops}
            />
          )}

          {selectedBus === null && (
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900/95 px-3 py-2 text-xs font-medium text-neutral-200 backdrop-blur lg:hidden"
            >
              {sidebarOpen ? (
                <>
                  <X className="h-3.5 w-3.5" /> Hide list
                </>
              ) : (
                <>
                  <List className="h-3.5 w-3.5" /> Show list
                </>
              )}
            </button>
          )}

          {sidebarOpen && selectedBus === null && (
            <div className="absolute inset-x-0 bottom-0 z-10 max-h-[45%] overflow-hidden rounded-t-2xl border-t border-neutral-800 bg-neutral-950/98 backdrop-blur lg:hidden">
              <BusList
                buses={sidebarBuses}
                selectedBusId={selectedBusId}
                activeBooking={activeBooking}
                onSelectBus={handleSelectBus}
                onCancelBooking={handleCancelActiveBooking}
                loading={loading}
              />
            </div>
          )}

          {!loading && !error && visibleBuses.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="pointer-events-auto rounded-xl border border-neutral-800 bg-neutral-900/95 px-6 py-4 text-center shadow-xl">
                <Bus className="mx-auto mb-2 h-8 w-8 text-neutral-500" />
                <p className="font-semibold">
                  {filterActive ? "No matching buses" : "No buses on the road"}
                </p>
                <p className="mt-1 max-w-xs text-xs text-neutral-400">
                  {filterActive
                    ? "Try clearing filters or choosing a different route."
                    : "There are no active trips right now."}
                </p>
              </div>
            </div>
          )}
        </div>

        {selectedBus !== null && (
          <div className="hidden w-[380px] flex-shrink-0 lg:block">
            <BusDetailDrawer
              bus={selectedBus}
              onClose={handleCloseDetail}
              onCenter={handleCenter}
              onBookSeat={handleOpenBooking}
            />
          </div>
        )}
      </div>

      {selectedBus !== null && (
        <div className="fixed inset-0 lg:hidden" style={{ zIndex: 9000 }}>
          <div
            className="absolute inset-0 bg-black/60"
            onClick={handleCloseDetail}
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-neutral-950">
            <BusDetailDrawer
              bus={selectedBus}
              onClose={handleCloseDetail}
              onCenter={handleCenter}
              onBookSeat={handleOpenBooking}
            />
          </div>
        </div>
      )}

      {bookingBus && (
        <BookingModal
          bus={bookingBus}
          fromStopId="33333333-0000-0000-0001-000000000004"
          fromStopName={bookingBus.route?.origin ?? "Your stop"}
          toStopId="33333333-0000-0000-0001-000000000005"
          toStopName={bookingBus.route?.destination ?? "Your destination"}
          onClose={() => setBookingBus(null)}
          onSuccess={handleBookingSuccess}
        />
      )}
    </div>
  );
}