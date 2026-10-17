"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import {
  getActiveBuses,
  type PublicBus,
} from "@/lib/passengerApi";
import { BusList } from "@/components/map/BusList";
import { BusDetailDrawer } from "@/components/map/BusDetailDrawer";
import {
  getActiveBooking,
  getBookingStatus,
  cancelBooking,
  type BookingDetail,
} from "@/lib/passengerBookingApi";

export default function LiveBusesPage() {
  const router = useRouter();
  const [buses, setBuses] = useState<PublicBus[]>([]);
  const [activeBooking, setActiveBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBusState, setSelectedBusState] = useState<PublicBus | null>(null);

      const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const busData = await getActiveBuses();

      // getActiveBooking returns a summary (handoff_id, token, etc.).
      // getBookingStatus takes it further and returns the full BookingDetail.
      let booking: BookingDetail | null = null;
      try {
        const summary = getActiveBooking();
        if (summary) {
          const status = await getBookingStatus(summary.handoff_id);
          if (status.success && status.booking) {
            booking = status.booking;
          }
        }
      } catch {
        booking = null;
      }

      setBuses(busData);
      setActiveBooking(booking);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleCancelBooking(handoffId: string) {
    await cancelBooking(handoffId);
    setActiveBooking(null);
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-neutral-950">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-950/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-green-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            Live
          </span>
          <h1 className="text-base font-bold">Live Buses</h1>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="text-neutral-400 hover:text-neutral-200 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </header>

      {/* List */}
      <div className="flex-1 min-h-0 pb-16">
        {loading && buses.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading buses…
          </div>
        ) : (
          <BusList
            buses={buses}
            selectedBusId={null}
            activeBooking={activeBooking}
            onSelectBus={(bus) => setSelectedBusState(bus)}
            onCancelBooking={handleCancelBooking}
            loading={loading}
          />
        )}
      </div>
      {selectedBusState && (
        <BusDetailDrawer
          bus={selectedBusState}
          onClose={() => setSelectedBusState(null)}
          onCenter={(bus) => {
            window.location.href = `/map?selected=${encodeURIComponent(bus.trip_id)}`;
          }}
        />
      )}
    </div>
  );
}
