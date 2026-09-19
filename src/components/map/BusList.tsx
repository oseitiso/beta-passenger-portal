"use client";

import { useState } from "react";
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
} from "lucide-react";
import type { PublicBus } from "@/lib/passengerApi";
import type { BookingDetail } from "@/lib/passengerBookingApi";

interface BusListProps {
  buses: PublicBus[];
  selectedBusId: string | null;
  activeBooking: BookingDetail | null;
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

function statusLabel(status: string): { label: string; colorClass: string } {
  switch (status) {
    case "PENDING":
      return { label: "Waiting for driver", colorClass: "text-blue-300" };
    case "ACCEPTED":
      return { label: "Driver confirmed", colorClass: "text-green-300" };
    case "PICKED_UP":
      return { label: "On board", colorClass: "text-green-200" };
    default:
      return { label: status, colorClass: "text-neutral-300" };
  }
}

export function BusList({
  buses,
  selectedBusId,
  activeBooking,
  onSelectBus,
  onCancelBooking,
  loading,
}: BusListProps) {
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const sorted = [...buses].sort((a, b) => {
    const pa = a.vehicle?.registration_plate ?? "";
    const pb = b.vehicle?.registration_plate ?? "";
    return pa.localeCompare(pb);
  });

  if (loading && buses.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-neutral-500">
        Loading buses…
      </div>
    );
  }

  if (buses.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <Bus className="mb-2 h-8 w-8 text-neutral-600" />
        <p className="text-sm font-medium text-neutral-400">
          No buses on the road
        </p>
        <p className="mt-1 text-xs text-neutral-600">
          Check back later, or clear filters
        </p>
      </div>
    );
  }

  const handleCancel = async (handoffId: string) => {
    if (!confirm("Cancel this booking request?")) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await onCancelBooking(handoffId);
      setExpandedTripId(null);
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-shrink-0 border-b border-neutral-800 px-4 py-2 text-xs font-medium text-neutral-500">
        {buses.length} {buses.length === 1 ? "bus" : "buses"} active
      </div>

      <ul className="flex-1 divide-y divide-neutral-800 overflow-y-auto">
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

          // Match active booking to this bus by trip_code (fallback to trip_id)
          const isBookingHere =
            activeBooking !== null &&
            (activeBooking.trip_code === tripCode ||
              (activeBooking as any).trip_id === bus.trip_id);

          const isExpanded = expandedTripId === bus.trip_id;

          const handleCardClick = () => {
            if (isBookingHere && activeBooking) {
              setExpandedTripId(isExpanded ? null : bus.trip_id);
            } else {
              onSelectBus(bus);
            }
          };

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
                  onClick={handleCardClick}
                  className="w-full px-4 py-3 text-left transition-colors hover:bg-neutral-900"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${
                        isBookingHere
                          ? "bg-orange-600 text-white"
                          : "bg-orange-600/20 text-orange-500"
                      }`}
                    >
                      <Bus className="h-3.5 w-3.5" />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-100">
                      {plate}
                    </span>
                    {isBookingHere && activeBooking && (
                      <span className="flex flex-shrink-0 items-center gap-1 rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        <Clock className="h-2.5 w-2.5" />
                        {activeBooking.handoff_status === "PENDING"
                          ? formatCountdown(activeBooking.expires_at)
                          : activeBooking.handoff_status === "ACCEPTED"
                          ? "PIN"
                          : "Booked"}
                      </span>
                    )}
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
                    {isBookingHere && (
                      <span className="ml-auto flex items-center gap-1 text-orange-400">
                        {isExpanded ? (
                          <>
                            <ChevronUp className="h-3 w-3" /> Hide
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3" /> Details
                          </>
                        )}
                      </span>
                    )}
                  </div>
                </button>

                {isBookingHere && isExpanded && activeBooking && (
                  <BookingExpandedCard
                    booking={activeBooking}
                    cancelling={cancelling}
                    cancelError={cancelError}
                    onCancel={handleCancel}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BookingExpandedCard({
  booking,
  cancelling,
  cancelError,
  onCancel,
}: {
  booking: BookingDetail;
  cancelling: boolean;
  cancelError: string | null;
  onCancel: (handoffId: string) => void;
}) {
  const statusInfo = statusLabel(booking.handoff_status);
  const showPin =
    booking.booking_pin &&
    (booking.handoff_status === "ACCEPTED" ||
      booking.handoff_status === "PICKED_UP");

  const canCancel =
    booking.handoff_status === "PENDING" ||
    booking.handoff_status === "ACCEPTED";

  return (
    <div className="border-t border-neutral-800 bg-neutral-900/40 px-4 py-3">
      <div className="mb-3 flex items-center gap-2 text-xs">
        <span className={`font-semibold ${statusInfo.colorClass}`}>
          {statusInfo.label}
        </span>
        {booking.handoff_status === "PENDING" && (
          <span className="text-neutral-500">
            · Expires in {formatCountdown(booking.expires_at)}
          </span>
        )}
      </div>

      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wider text-neutral-500">
          Booking reference
        </div>
        <div className="mt-0.5 font-mono text-sm font-bold text-neutral-100">
          {booking.booking_reference}
        </div>
      </div>

      {showPin && (
        <div className="mb-3 rounded-lg border border-orange-700/40 bg-neutral-950/50 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-orange-400">
            <KeyRound className="h-3 w-3" />
            Show this PIN to the driver
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tracking-widest text-orange-300">
            {booking.booking_pin}
          </div>
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-[10px] uppercase text-neutral-500">From</div>
          <div className="text-neutral-200">{booking.route_origin ?? "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-neutral-500">To</div>
          <div className="text-neutral-200">
            {booking.route_destination ?? "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-neutral-500">Seats</div>
          <div className="text-neutral-200">{booking.requested_seats}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-neutral-500">Name</div>
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
  );
}