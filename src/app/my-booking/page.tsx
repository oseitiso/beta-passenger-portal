"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";
import {
  getActiveBooking,
  getBookingStatus,
  cancelBooking,
  clearActiveBooking,
  type BookingDetail,
} from "@/lib/passengerBookingApi";

export default function MyBookingPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Tick every second for countdowns
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const loadBooking = useCallback(async () => {
    setLoading(true);
    setError(null);

    const stored = getActiveBooking();
    if (!stored?.booking_reference) {
      setBooking(null);
      setLoading(false);
      return;
    }

    try {
      const result = await getBookingStatus(stored.booking_reference);
      if (result.success && result.booking) {
        setBooking(result.booking);
      } else {
        setError(result.error ?? "Booking not found");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load booking");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) loadBooking();
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
        await loadBooking();
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
            onClick={loadBooking}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
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
            {/* Status banner */}
            <StatusBanner booking={booking} tick={tick} />

            {/* PIN card (visible only when accepted) */}
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

            {/* Booking reference */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
              <div className="text-xs text-neutral-500">Booking reference</div>
              <div className="mt-1 font-mono text-lg font-bold text-neutral-100">
                {booking.booking_reference}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Save this to recover your booking if needed
              </div>
            </div>

            {/* Details */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DetailRow
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  label="Route"
                  value={booking.route_name ?? "—"}
                />
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
              </div>
            </div>

            {/* Actions */}
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

            {/* Finished states */}
            {(booking.handoff_status === "CANCELLED" ||
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
      </main>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function StatusBanner({
  booking,
  tick,
}: {
  booking: BookingDetail;
  tick: number;
}) {
  const status = booking.handoff_status;

  // Compute expiry countdown
  const expiresAt = new Date(booking.expires_at).getTime();
  const now = Date.now();
  const remainingSec = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const remainingMin = Math.floor(remainingSec / 60);
  const remainingClock = `${remainingMin}:${String(remainingSec % 60).padStart(2, "0")}`;

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
              <> Expires in <span className="font-mono">{remainingClock}</span>.</>
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
            Head to <span className="font-medium">{booking.route_origin ?? "your stop"}</span>.
            Show the PIN below to the driver when the bus arrives.
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
            Enjoy your trip to {booking.route_destination ?? "your destination"}.
            Pay the driver in cash if you haven't already.
          </div>
        </div>
      </div>
    );
  }

  if (status === "CANCELLED") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
        <X className="mt-0.5 h-5 w-5 flex-shrink-0 text-neutral-400" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-neutral-200">
            Booking cancelled
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            You can request another seat on the map.
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
            The driver didn't respond within 10 minutes.
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