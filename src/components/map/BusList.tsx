"use client";

import { useState, useEffect, useRef } from "react";
import {
  Bus,
  Gauge,
  Users,
  ChevronDown,
  ChevronUp,
  KeyRound,
  X,
  Loader2,
  Clock,
  MapPinOff,
  CheckCircle2,
  History,
  AlertCircle,
} from "lucide-react";
import type { PublicBus } from "@/lib/passengerApi";
import type {
  BookingDetail,
  BookingHistoryEntry,
} from "@/lib/passengerBookingApi";
import { getBookingHistory } from "@/lib/passengerBookingApi";

interface BusListProps {
  buses: PublicBus[];
  selectedBusId: string | null;
  activeBooking: BookingDetail | null;
  recentlyEndedBooking?: BookingDetail | null;
  onSelectBus: (bus: PublicBus) => void;
  onCancelBooking: (handoffId: string) => Promise<void>;
  loading: boolean;
}

function timeSince(iso: string | null | undefined): string {
  if (!iso) return "—";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 10) return "now";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

function formatCountdown(expiresAt: string): string {
  const expires = new Date(expiresAt).getTime();
  const now = Date.now();
  const remainingSec = Math.max(0, Math.floor((expires - now) / 1000));
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatRelativeTime(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusLabel(status: string): { label: string; colorClass: string } {
  switch (status) {
    case "PENDING":
      return { label: "Waiting for driver", colorClass: "text-blue-300" };
    case "ACCEPTED":
      return { label: "Driver confirmed", colorClass: "text-green-300" };
    case "PICKED_UP":
      return { label: "On board", colorClass: "text-green-200" };
    case "MISSED":
      return { label: "Missed", colorClass: "text-amber-300" };
    case "CANCELLED":
      return { label: "Cancelled", colorClass: "text-red-300" };
    case "COMPLETED":
      return { label: "Completed", colorClass: "text-neutral-300" };
    case "EXPIRED":
      return { label: "Expired", colorClass: "text-neutral-400" };
    case "NO_SHOW":
      return { label: "No-show", colorClass: "text-amber-400" };
    case "DECLINED":
      return { label: "Declined", colorClass: "text-red-400" };
    case "DISRUPTED":
      return { label: "Disrupted", colorClass: "text-amber-300" };
    default:
      return { label: status, colorClass: "text-neutral-300" };
  }
}

function findBookingBus(
  buses: PublicBus[],
  activeBooking: BookingDetail | null
): PublicBus | null {
  if (!activeBooking) return null;
  return (
    buses.find(
      (bus) =>
        bus.trip_code === activeBooking.trip_code ||
        (activeBooking as any).trip_id === bus.trip_id
    ) ?? null
  );
}

function isDisrupted(booking: BookingDetail): boolean {
  return booking.pickup_disruption_flag === true;
}

export function BusList({
  buses,
  selectedBusId,
  activeBooking,
  recentlyEndedBooking,
  onSelectBus,
  onCancelBooking,
  loading,
}: BusListProps) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<BookingHistoryEntry[]>([]);

  // Track whether we've ever had a successful first load. This ensures
  // the loading screen only shows on the cold start, not on every 15s
  // poll that flips `loading` back to true.
  const hasLoadedOnceRef = useRef(false);
  if (!loading && buses.length >= 0) {
    // Any completed fetch flips this on.
    if (!hasLoadedOnceRef.current) hasLoadedOnceRef.current = true;
  }

  const sorted = [...buses].sort((a, b) => {
    const pa = a.vehicle?.registration_plate ?? "";
    const pb = b.vehicle?.registration_plate ?? "";
    return pa.localeCompare(pb);
  });

  const bookingBus = findBookingBus(buses, activeBooking);

  useEffect(() => {
    if (historyOpen) {
      setHistory(getBookingHistory());
    }
  }, [historyOpen]);

  const handleCancel = async (handoffId: string) => {
    if (!confirm("Cancel this booking request?")) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await onCancelBooking(handoffId);
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────
  // Show the loading screen ONLY on the very first fetch after mount,
  // and only if there is nothing else to display. Subsequent polling
  // refreshes leave the existing UI in place.
  const isColdStart = loading && !hasLoadedOnceRef.current;
  if (isColdStart && !activeBooking && !recentlyEndedBooking) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-neutral-500">
        Loading buses…
      </div>
    );
  }

  const showBusEmptyState = buses.length === 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Scrollable content region ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {activeBooking && (
          <BookingReceipt
            booking={activeBooking}
            liveBus={bookingBus}
            cancelling={cancelling}
            cancelError={cancelError}
            onCancel={handleCancel}
          />
        )}

        {!activeBooking && recentlyEndedBooking && (
          <EndedBanner booking={recentlyEndedBooking} />
        )}

        <div className="flex-shrink-0 border-b border-neutral-800 px-4 py-2 text-xs font-medium text-neutral-500">
          {buses.length} {buses.length === 1 ? "bus" : "buses"} active
        </div>

        {showBusEmptyState ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <Bus className="mb-2 h-8 w-8 text-neutral-600" />
            <p className="text-sm font-medium text-neutral-400">
              No other buses on the road
            </p>
            {(activeBooking || recentlyEndedBooking) && (
              <p className="mt-1 text-xs text-neutral-600">
                {activeBooking
                  ? "Your booking is still active — see receipt above"
                  : "Your recent trip is shown above"}
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-neutral-800">
            {sorted.map((bus) => {
              const isSelected = bus.trip_id === selectedBusId;
              const speed = Math.round(bus.live?.speed_kph ?? 0);
              const passengers = bus.vehicle?.passenger_count ?? 0;
              const capacity = bus.vehicle?.capacity;
              const plate = bus.vehicle?.registration_plate ?? "Unknown";
              const origin = bus.route?.origin ?? "—";
              const destination = bus.route?.destination ?? "—";
              const tripCode = bus.trip_code ?? bus.trip_id.slice(0, 8);
              const lastSeen = timeSince(bus.live?.last_position_at);
              const isBookingBus = bus.trip_id === bookingBus?.trip_id;

              return (
                <li key={bus.trip_id}>
                  <div
                    className={`transition-colors ${
                      isSelected
                        ? "bg-orange-600/10 border-l-2 border-orange-600"
                        : "border-l-2 border-transparent"
                    }`}
                  >
                    <button
                      onClick={() => onSelectBus(bus)}
                      className="w-full px-4 py-3 text-left transition-colors hover:bg-neutral-900"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${
                            isBookingBus
                              ? "bg-orange-600 text-white"
                              : "bg-orange-600/20 text-orange-500"
                          }`}
                        >
                          <Bus className="h-3.5 w-3.5" />
                        </div>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-100">
                          {plate}
                        </span>
                        <span className="flex flex-shrink-0 items-center gap-1 text-xs text-neutral-400">
                          <Gauge className="h-3 w-3" />
                          {speed}
                        </span>
                        <span className="flex-shrink-0 text-[10px] text-neutral-500">
                          {lastSeen}
                        </span>
                      </div>

                      <div className="mt-1.5 truncate text-xs text-neutral-300">
                        {origin} <span className="text-neutral-600">→</span>{" "}
                        {destination}
                      </div>

                      <div className="mt-1.5 flex items-center gap-3 text-xs text-neutral-500">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {passengers}
                          {capacity ? `/${capacity}` : ""}
                        </span>
                        <span className="truncate font-mono text-[10px] tracking-tight">
                          {tripCode}
                        </span>
                      </div>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Pinned: Recent trips (always visible at bottom) ───────────── */}
      <div className="flex-shrink-0 border-t border-neutral-800 bg-neutral-950">
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-neutral-400 transition-colors hover:bg-neutral-900"
        >
          <History className="h-3 w-3" />
          <span className="flex-1">Recent trips</span>
          {historyOpen ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>

        {historyOpen && (
          <div className="max-h-64 overflow-y-auto border-t border-neutral-800">
            {history.length === 0 ? (
              <div className="px-4 py-3 text-xs text-neutral-600">
                No past trips yet
              </div>
            ) : (
              <ul className="divide-y divide-neutral-800/60">
                {history.map((entry) => {
                  const st = statusLabel(entry.handoff_status);
                  const from = entry.from_stop_name ?? entry.route_origin ?? "—";
                  const to =
                    entry.to_stop_name ?? entry.route_destination ?? "—";
                  return (
                    <li key={entry.handoff_id} className="px-4 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-semibold uppercase ${st.colorClass}`}
                        >
                          {st.label}
                        </span>
                        <span className="ml-auto text-[10px] text-neutral-600">
                          {formatRelativeTime(entry.ended_at)}
                        </span>
                      </div>
                      <div className="mt-1 truncate font-mono text-[10px] text-neutral-500">
                        {entry.booking_reference}
                      </div>
                      <div className="mt-0.5 truncate text-neutral-300">
                        {from} <span className="text-neutral-600">→</span> {to}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Banner shown when the most recent booking ended and there's no live
 * active booking. Explains the outcome instead of silently vanishing.
 */
function EndedBanner({ booking }: { booking: BookingDetail }) {
  const disrupted = isDisrupted(booking);
  const st = statusLabel(booking.handoff_status);
  const destination =
    booking.to_stop_name ??
    booking.route_destination ??
    booking.route_name ??
    "your destination";

  const message = (() => {
    if (disrupted) {
      return `You were never marked as arriving at ${destination}. The trip was ended early.`;
    }
    switch (booking.handoff_status) {
      case "COMPLETED":
        return `Trip completed — you arrived at ${destination}`;
      case "EXPIRED":
        return "Booking expired before the driver accepted it";
      case "CANCELLED":
        return "This booking was cancelled";
      case "NO_SHOW":
        return "Marked as no-show — the driver didn't find you";
      case "DECLINED":
        return "Driver declined this request";
      default:
        return "This booking has ended";
    }
  })();

  const label = disrupted ? "Trip disrupted" : st.label;
  const accent = disrupted ? "text-amber-300" : st.colorClass;

  return (
    <div
      className={`flex-shrink-0 border-b px-4 py-3 ${
        disrupted
          ? "border-amber-900/40 bg-amber-950/20"
          : "border-neutral-800 bg-neutral-900/50"
      }`}
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className={`text-xs font-semibold ${accent}`}>{label}</div>
          <div className="mt-0.5 text-xs text-neutral-400">{message}</div>
          <div className="mt-1 font-mono text-[10px] text-neutral-600">
            {booking.booking_reference}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Pinned receipt for the passenger's active booking.
 */
function BookingReceipt({
  booking,
  liveBus,
  cancelling,
  cancelError,
  onCancel,
}: {
  booking: BookingDetail;
  liveBus: PublicBus | null;
  cancelling: boolean;
  cancelError: string | null;
  onCancel: (handoffId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [boardedMessageSwapped, setBoardedMessageSwapped] = useState(false);

  const disrupted = isDisrupted(booking);
  const statusInfo = disrupted
    ? { label: "Trip disrupted", colorClass: "text-amber-300" }
    : statusLabel(booking.handoff_status);

  const showPin =
    booking.booking_pin && booking.handoff_status === "ACCEPTED";

  const canCancel =
    booking.handoff_status === "PENDING" ||
    booking.handoff_status === "ACCEPTED";

  const plate = liveBus?.vehicle?.registration_plate ?? null;
  const speed = liveBus ? Math.round(liveBus.live?.speed_kph ?? 0) : null;
  const lastSeen = liveBus ? timeSince(liveBus.live?.last_position_at) : null;

  const destination =
    booking.to_stop_name ??
    booking.route_destination ??
    booking.route_name ??
    "your destination";

  const isBoarded = booking.handoff_status === "PICKED_UP";

  useEffect(() => {
    if (!isBoarded || disrupted) {
      setBoardedMessageSwapped(false);
      return;
    }
    const t = setTimeout(() => setBoardedMessageSwapped(true), 5000);
    return () => clearTimeout(t);
  }, [isBoarded, disrupted]);

  return (
    <div
      className={`flex-shrink-0 border-b ${
        disrupted
          ? "border-amber-900/40 bg-amber-950/10"
          : "border-neutral-800 bg-neutral-950"
      }`}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 text-left transition-colors hover:bg-neutral-900"
      >
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${
              disrupted ? "bg-amber-600" : "bg-orange-600"
            }`}
          >
            {disrupted ? "Disrupted" : "Your booking"}
          </span>
          <span className={`text-xs font-semibold ${statusInfo.colorClass}`}>
            {statusInfo.label}
          </span>
          {booking.handoff_status === "PENDING" && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-neutral-500">
              <Clock className="h-2.5 w-2.5" />
              {formatCountdown(booking.expires_at)}
            </span>
          )}
          <span
            className={`${
              booking.handoff_status === "PENDING" ? "" : "ml-auto"
            } flex items-center gap-1 text-orange-400`}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" /> Hide
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" /> Details
              </>
            )}
          </span>
        </div>

        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider text-neutral-500">
            Booking reference
          </div>
          <div className="mt-0.5 font-mono text-sm font-bold text-neutral-100">
            {booking.booking_reference}
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 text-xs">
          {disrupted ? (
            <>
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-amber-300" />
              <span className="text-amber-300">
                Trip ended before you arrived at {destination}
              </span>
            </>
          ) : liveBus ? (
            <>
              <Bus className="h-3.5 w-3.5 flex-shrink-0 text-orange-500" />
              <span className="min-w-0 flex-1 truncate font-medium text-neutral-200">
                {plate ?? "Your bus"}
              </span>
              <span className="flex items-center gap-1 text-neutral-400">
                <Gauge className="h-3 w-3" />
                {speed}
              </span>
              <span className="text-[10px] text-neutral-500">{lastSeen}</span>
            </>
          ) : booking.handoff_status === "PICKED_UP" ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-green-300" />
              <span className="text-green-300">
                On board — you'll be dropped at {destination}
              </span>
            </>
          ) : booking.handoff_status === "MISSED" ? (
            <>
              <MapPinOff className="h-3.5 w-3.5 flex-shrink-0 text-amber-300" />
              <span className="text-amber-300">
                Driver didn't arrive
                {booking.pickup_missed_reason
                  ? ` — ${booking.pickup_missed_reason}`
                  : ""}
              </span>
            </>
          ) : (
            <>
              <MapPinOff className="h-3.5 w-3.5 flex-shrink-0 text-neutral-500" />
              <span className="text-neutral-500">
                Bus location unavailable
              </span>
            </>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-neutral-800 px-4 py-3">
          {disrupted && (
            <div className="mb-3 rounded-lg border border-amber-800/50 bg-amber-950/30 p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-400">
                <AlertCircle className="h-3 w-3" />
                Trip disrupted
              </div>
              <div className="mt-1 text-sm text-amber-200">
                The trip ended before you were marked as arriving at{" "}
                {destination}. You were not charged for this leg.
              </div>
              <div className="mt-2 text-[11px] text-amber-300/80">
                If you need help, open a complaint from the Help menu.
              </div>
            </div>
          )}

          {showPin && (
            <div className="mb-3 rounded-lg border border-orange-700/40 bg-neutral-900/50 p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-orange-400">
                <KeyRound className="h-3 w-3" />
                Show this PIN to the driver
              </div>
              <div className="mt-1 font-mono text-2xl font-bold tracking-widest text-orange-300">
                {booking.booking_pin}
              </div>
            </div>
          )}

          {isBoarded && !disrupted && (
            <div className="mb-3 rounded-lg border border-green-800/40 bg-green-950/20 p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-green-400">
                <CheckCircle2 className="h-3 w-3" />
                Boarded
              </div>
              <div className="mt-1 text-sm text-green-200">
                {boardedMessageSwapped
                  ? `You are now boarded to ${destination}`
                  : "PIN verified — enjoy your trip"}
              </div>
            </div>
          )}

          <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-[10px] uppercase text-neutral-500">
                From
              </div>
              <div className="truncate text-neutral-200">
                {booking.from_stop_name ?? booking.route_origin ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-neutral-500">To</div>
              <div className="truncate text-neutral-200">
                {booking.to_stop_name ?? booking.route_destination ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-neutral-500">
                Seats
              </div>
              <div className="text-neutral-200">{booking.requested_seats}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-neutral-500">
                Name
              </div>
              <div className="truncate text-neutral-200">
                {booking.passenger_name ?? "—"}
              </div>
            </div>
          </div>

          {canCancel && (
            <button
              onClick={() => onCancel(booking.handoff_id)}
              disabled={cancelling}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-xs font-medium text-red-300 transition-colors hover:bg-red-950/60 disabled:opacity-50"
            >
              {cancelling ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Cancelling…
                </>
              ) : (
                <>
                  <X className="h-3.5 w-3.5" />
                  Cancel booking
                </>
              )}
            </button>
          )}

          {cancelError && (
            <div className="mt-2 text-[10px] text-red-400">{cancelError}</div>
          )}
        </div>
      )}
    </div>
  );
}