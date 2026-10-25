"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  X,
  CheckCircle2,
  Clock,
  User,
  Phone,
  MapPin,
  KeyRound,
  AlertCircle,
  Flag,
  History,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import {
  getActiveBooking,
  getBookingStatus,
  cancelBooking,
  clearActiveBooking,
  getBookingHistory,
  type BookingDetail,
  type BookingHistoryEntry,
} from "@/lib/passengerBookingApi";

const POLL_INTERVAL_MS = 10_000;

export default function MyBookingPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [history, setHistory] = useState<BookingHistoryEntry[]>([]);

  const inFlightRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    setHistory(getBookingHistory());
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const loadBooking = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;

    if (inFlightRef.current) return;
    inFlightRef.current = true;

    if (!silent) setLoading(true);
    setError(null);

    const stored = getActiveBooking();
    if (!stored?.booking_reference) {
      setBooking(null);
      setLoading(false);
      inFlightRef.current = false;
      setHistory(getBookingHistory());
      return;
    }

    try {
      const result = await getBookingStatus(stored.booking_reference);
      if (result.success && result.booking) {
        setBooking(result.booking);
      } else if (!silent) {
        setError(result.error ?? "Booking not found");
      }
      setHistory(getBookingHistory());
    } catch (e: unknown) {
      if (!silent) {
        setError(e instanceof Error ? e.message : "Failed to load booking");
      }
    } finally {
      if (!silent) setLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (mounted) loadBooking();
  }, [mounted, loadBooking]);

  useEffect(() => {
    if (!mounted) return;

    const poll = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        loadBooking({ silent: true });
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        loadBooking({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [mounted, loadBooking]);

  const handleCancel = async () => {
    if (!booking) return;
    if (!confirm("Cancel this booking?")) return;

    setCancelling(true);
    setCancelError(null);

    try {
      const result = await cancelBooking(booking.handoff_id);
      if (result.success) {
        clearActiveBooking();
        await loadBooking({ silent: true });
      } else {
        setCancelError(result.error ?? "Failed to cancel");
      }
    } catch (e: unknown) {
      setCancelError(e instanceof Error ? e.message : "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  };

  const handleClear = () => {
    if (confirm("Forget this booking on this device?")) {
      clearActiveBooking();
      setBooking(null);
    }
  };

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  const isRecentForReport =
    booking &&
    (booking.handoff_status !== "COMPLETED" ||
      new Date(booking.created_at).getTime() >
        Date.now() - 48 * 60 * 60 * 1000);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link
            href="/map"
            className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to map
          </Link>
          <div className="text-xs text-neutral-500">My Booking</div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold">My Booking</h1>
          <button
            onClick={() => loadBooking()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {loading && !booking && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          </div>
        )}

        {!loading && !booking && !error && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-8 text-center">
            <MapPin className="mx-auto mb-3 h-10 w-10 text-neutral-600" />
            <div className="text-lg font-semibold">No active booking</div>
            <div className="mt-2 text-sm text-neutral-400">
              Go to the map to request a seat on a live bus.
            </div>
            <Link
              href="/map"
              className="mt-4 inline-block rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500"
            >
              Find a bus
            </Link>
          </div>
        )}

        {booking && (
          <div className="space-y-4">
            <StatusBanner booking={booking} tick={tick} />

            {booking.booking_pin &&
              (booking.handoff_status === "ACCEPTED" ||
                booking.handoff_status === "PICKED_UP") && (
                <div className="rounded-xl border border-orange-900/40 bg-gradient-to-br from-orange-950/50 to-orange-900/20 p-6">
                  <div className="mb-1 flex items-center gap-2 text-xs font-medium text-orange-400">
                    <KeyRound className="h-3 w-3" />
                    Show this PIN to the driver when you board
                  </div>
                  <div className="mt-2 font-mono text-4xl font-bold tracking-widest text-orange-300">
                    {booking.booking_pin}
                  </div>
                </div>
              )}

            <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
              <div className="text-xs text-neutral-500">Booking reference</div>
              <div className="mt-1 font-mono text-lg font-bold text-neutral-100">
                {booking.booking_reference}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Save this to recover your booking if needed
              </div>
            </div>

            {/* --- ADDED SEAT NUMBERS CARD --- */}
            {booking.seat_numbers && booking.seat_numbers.length > 0 && (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
                <div className="text-xs text-neutral-500">
                  {booking.seat_numbers.length > 1 ? "Your seats" : "Your seat"}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {booking.seat_numbers.map((n) => (
                    <span
                      key={String(n)}
                      className="flex h-10 min-w-10 items-center justify-center rounded-t-lg rounded-b-sm border-2 border-orange-500 bg-orange-600 px-2 font-mono text-base font-bold text-white"
                    >
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-orange-900/40 bg-orange-950/20 p-4">
              <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-orange-400">
                <MapPin className="h-3.5 w-3.5" />
                Your journey
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                    Boarding
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-neutral-100">
                    {booking.from_stop_name ?? booking.route_origin ?? "—"}
                  </div>
                </div>
                <div className="text-neutral-600">→</div>
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                    Alighting
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-neutral-100">
                    {booking.to_stop_name ?? booking.route_destination ?? "—"}
                  </div>
                </div>
              </div>
              {booking.route_name && (
                <div className="mt-3 border-t border-orange-900/30 pt-3 text-xs text-neutral-500">
                  Route:{" "}
                  <span className="text-neutral-300">{booking.route_name}</span>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DetailRow
                  icon={<User className="h-3.5 w-3.5" />}
                  label="Passenger"
                  value={booking.passenger_name ?? "—"}
                />
                <DetailRow
                  icon={<Phone className="h-3.5 w-3.5" />}
                  label="Phone"
                  value={booking.passenger_phone ?? "—"}
                />
                <DetailRow
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Seats"
                  value={`${booking.requested_seats}`}
                />
                <DetailRow
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  label="Trip"
                  value={booking.trip_code ?? "—"}
                />
              </div>
            </div>

            {(booking.handoff_status === "PENDING" ||
              booking.handoff_status === "ACCEPTED") && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-800 bg-red-950/30 px-4 py-2.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-950/50 disabled:opacity-50"
                >
                  {cancelling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                  Cancel booking
                </button>

                {cancelError && (
                  <div className="text-xs text-red-400">{cancelError}</div>
                )}
              </div>
            )}

            {isRecentForReport && (
              <Link
                href={`/help?handoff=${booking.handoff_id}`}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800"
              >
                <Flag className="h-4 w-4 text-orange-400" />
                Report a problem
              </Link>
            )}

            {(booking.handoff_status === "CANCELLED" ||
              booking.handoff_status === "DISRUPTED" ||
              booking.handoff_status === "EXPIRED" ||
              booking.handoff_status === "DECLINED" ||
              booking.handoff_status === "NO_SHOW" ||
              booking.handoff_status === "COMPLETED") && (
              <button
                onClick={handleClear}
                className="w-full rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800"
              >
                Forget this booking
              </button>
            )}
          </div>
        )}

        {/* Recent trips — always visible, above the fold on mobile */}
        {history.length > 0 && (
          <section className="mt-8">
            <div className="mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-neutral-500" />
              <h2 className="text-sm font-semibold text-neutral-200">
                Recent trips
              </h2>
              <span className="text-xs text-neutral-500">
                ({history.length})
              </span>
            </div>

            <ul className="space-y-2">
              {history.map((entry) => (
                <RecentTripRow key={entry.handoff_id} entry={entry} />
              ))}
            </ul>
          </section>
        )}

        {!loading && history.length === 0 && !booking && (
          <div className="mt-8 rounded-xl border border-neutral-800 bg-neutral-900/20 p-6 text-center">
            <History className="mx-auto mb-2 h-6 w-6 text-neutral-600" />
            <div className="text-sm text-neutral-400">No past trips yet</div>
            <div className="mt-1 text-xs text-neutral-600">
              Trips you finish or cancel will appear here.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ——— Recent trip row (expandable) —————————————————————————————————————————

function RecentTripRow({ entry }: { entry: BookingHistoryEntry }) {
  const [open, setOpen] = useState(false);
  const st = statusLabel(entry.handoff_status);
  const from = entry.from_stop_name ?? entry.route_origin ?? "—";
  const to = entry.to_stop_name ?? entry.route_destination ?? "—";
  const when = formatRelativeTime(entry.ended_at);

  const reportable =
    entry.handoff_status !== "COMPLETED" ||
    Date.now() - entry.ended_at < 48 * 60 * 60 * 1000;

  return (
    <li className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/30">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-900/60"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide ${st.colorClass}`}
            >
              {st.label}
            </span>
            <span className="ml-auto text-[10px] text-neutral-500">
              {when}
            </span>
          </div>
          <div className="mt-1 truncate text-sm text-neutral-200">
            {from} <span className="text-neutral-600">→</span> {to}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-neutral-500">
            {entry.booking_reference}
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 flex-shrink-0 text-neutral-500" />
        ) : (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-neutral-500" />
        )}
      </button>

      {open && (
        <div className="border-t border-neutral-800 px-4 py-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-[10px] uppercase text-neutral-500">
                Boarding
              </div>
              <div className="truncate text-neutral-200">{from}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-neutral-500">
                Alighting
              </div>
              <div className="truncate text-neutral-200">{to}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-neutral-500">
                Seats
              </div>
              <div className="text-neutral-200">{entry.requested_seats}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-neutral-500">
                Passenger
              </div>
              <div className="truncate text-neutral-200">
                {entry.passenger_name ?? "—"}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] uppercase text-neutral-500">
                Ended
              </div>
              <div className="text-neutral-200">
                {new Date(entry.ended_at).toLocaleString()}
              </div>
            </div>
          </div>

          {reportable && (
            <Link
              href={`/help?handoff=${entry.handoff_id}`}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-200 transition-colors hover:bg-neutral-800"
            >
              <Flag className="h-3.5 w-3.5 text-orange-400" />
              Report a problem
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

// ——— Status banner (updated) ————————————————————————————————————————————————

function StatusBanner({
  booking,
  tick,
}: {
  booking: BookingDetail;
  tick: number;
}) {
  const status = booking.handoff_status;

  const expiresAt = new Date(booking.expires_at).getTime();
  const now = Date.now();
  const remainingSec = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const remainingMin = Math.floor(remainingSec / 60);
  const remainingClock = `${remainingMin}:${String(remainingSec % 60).padStart(2, "0")}`;

  const boardingName =
    booking.from_stop_name ?? booking.route_origin ?? "your stop";
  const alightingName =
    booking.to_stop_name ?? booking.route_destination ?? "your destination";

  if (status === "PENDING") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-blue-900/40 bg-blue-950/30 p-4">
        <div className="mt-0.5">
          <div className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-blue-200">
            Waiting for driver to confirm
          </div>
          <div className="mt-1 text-xs text-blue-300/70">
            The driver has up to 10 minutes to respond.
            {remainingSec > 0 && (
              <>
                {" "}
                Expires in{" "}
                <span className="font-mono">{remainingClock}</span>.
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status === "ACCEPTED") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-green-900/40 bg-green-950/30 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-400" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-green-200">
            Driver confirmed your seat
          </div>
          <div className="mt-1 text-xs text-green-300/70">
            Head to <span className="font-medium">{boardingName}</span>. Show the
            PIN below to the driver when the bus arrives.
          </div>
        </div>
      </div>
    );
  }

  if (status === "PICKED_UP") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-green-900/40 bg-green-950/30 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-400" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-green-200">
            You are on the bus
          </div>
          <div className="mt-1 text-xs text-green-300/70">
            Enjoy your trip to{" "}
            <span className="font-medium">{alightingName}</span>. Pay the driver
            in cash if you haven&apos;t already.
          </div>
        </div>
      </div>
    );
  }

  // NEW: Handle DISRUPTED status explicitly
  if (status === "DISRUPTED") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-orange-900/40 bg-orange-950/30 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-400" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-orange-200">
            Trip disrupted
          </div>
          <div className="mt-1 text-xs text-orange-300/70">
            Your trip has been disrupted. You can now book another bus.
          </div>
        </div>
      </div>
    );
  }

  if (status === "CANCELLED") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-orange-900/40 bg-orange-950/30 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-400" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-orange-200">
            Trip cancelled
          </div>
          <div className="mt-1 text-xs text-orange-300/70">
            This trip has been cancelled. You can now book another bus.
          </div>
        </div>
      </div>
    );
  }

  if (status === "EXPIRED") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-900/40 bg-amber-950/30 p-4">
        <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-amber-200">
            Request expired
          </div>
          <div className="mt-1 text-xs text-amber-300/70">
            The driver didn&apos;t respond within 10 minutes.
          </div>
        </div>
      </div>
    );
  }

  if (status === "DECLINED") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-red-900/40 bg-red-950/30 p-4">
        <X className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-red-200">
            Driver declined
          </div>
          <div className="mt-1 text-xs text-red-300/70">
            Try requesting a different bus.
          </div>
        </div>
      </div>
    );
  }

  if (status === "NO_SHOW") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-red-900/40 bg-red-950/30 p-4">
        <X className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-red-200">
            No-show recorded
          </div>
          <div className="mt-1 text-xs text-red-300/70">
            {booking.pickup_status === "MISSED"
              ? "The PIN didn't verify or you didn't board in time."
              : "The booking was marked as no-show."}
          </div>
        </div>
      </div>
    );
  }

  if (status === "COMPLETED") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-green-900/40 bg-green-950/30 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-400" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-green-200">
            Trip completed
          </div>
          <div className="mt-1 text-xs text-green-300/70">
            Thanks for travelling with B-ETA.
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ——— Helpers ————————————————————————————————————————————————————————————————

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

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs text-neutral-500">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium text-neutral-100">{value}</div>
    </div>
  );
}