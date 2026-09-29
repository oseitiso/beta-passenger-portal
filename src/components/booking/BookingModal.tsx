"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Users,
  MapPin,
  Phone,
  User,
  ArrowRight,
  Ban,
} from "lucide-react";
import {
  requestBooking,
  saveActiveBooking,
  type BookingResponse,
} from "@/lib/passengerBookingApi";
import type { PublicBus, PublicStop } from "@/lib/passengerApi";
import {
  logBookingStarted,
  logBookingSubmitted,
  logBookingConfirmed,
  logBookingAbandoned,
} from "@/lib/events";

interface BookingModalProps {
  bus: PublicBus;
  /** All route stops, with boardability flags from the API */
  routeStops: PublicStop[];
  onClose: () => void;
  onSuccess: (response: BookingResponse) => void;
}

type Stage = "form" | "submitting" | "success" | "error";

const PHONE_PREFIX = "+267";
const PHONE_DIGITS = 8;

function reasonLabel(reason: PublicStop["unboardable_reason"]): string {
  switch (reason) {
    case "bus_passed":
      return "Bus already passed";
    case "too_close":
      return "Bus arriving too soon";
    case "destination":
      return "Final stop";
    case "off_route":
      return "Not on route";
    default:
      return "Unavailable";
  }
}

export function BookingModal({
  bus,
  routeStops,
  onClose,
  onSuccess,
}: BookingModalProps) {
  const [stage, setStage] = useState<Stage>("form");
  const [name, setName] = useState("");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [seats, setSeats] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<BookingResponse | null>(null);

  // Ref that flips to true the moment a booking is confirmed, so the
  // unmount cleanup knows not to fire booking_abandoned after success.
  const confirmedRef = useRef(false);
  const abandonedFiredRef = useRef(false);

  // Default boarding stop: the first boardable stop (API already resolves
  // this from the passenger's search via segment_availability)
  const defaultFromId = useMemo(() => {
    if (bus.segment_availability?.from_stop_id) {
      const match = routeStops.find(
        (s) => s.stop_id === bus.segment_availability!.from_stop_id
      );
      if (match) return match.stop_id;
    }
    const firstBoardable = routeStops.find((s) => s.boardable);
    return firstBoardable?.stop_id ?? routeStops[0]?.stop_id ?? "";
  }, [bus.segment_availability, routeStops]);

  const defaultToId = useMemo(() => {
    if (bus.segment_availability?.to_stop_id) {
      const match = routeStops.find(
        (s) => s.stop_id === bus.segment_availability!.to_stop_id
      );
      if (match) return match.stop_id;
    }
    return routeStops[routeStops.length - 1]?.stop_id ?? "";
  }, [bus.segment_availability, routeStops]);

  const [fromStopId, setFromStopId] = useState<string>(defaultFromId);
  const [toStopId, setToStopId] = useState<string>(defaultToId);

  // Fire booking_started exactly once on mount, and booking_abandoned
  // exactly once on unmount if no booking was confirmed.
  useEffect(() => {
    logBookingStarted(bus.trip_id, defaultFromId || null, defaultToId || null);
    return () => {
      if (!confirmedRef.current && !abandonedFiredRef.current) {
        abandonedFiredRef.current = true;
        logBookingAbandoned(bus.trip_id, "form_open");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus.trip_id]);

  // If the parent's defaults change (e.g. segment_availability arrives late),
  // realign if the current selections are invalid.
  useEffect(() => {
    const fromStop = routeStops.find((s) => s.stop_id === fromStopId);
    if (!fromStop || !fromStop.boardable) {
      setFromStopId(defaultFromId);
    }
  }, [defaultFromId, fromStopId, routeStops]);

  const fromStop = useMemo(
    () => routeStops.find((s) => s.stop_id === fromStopId),
    [routeStops, fromStopId]
  );
  const toStop = useMemo(
    () => routeStops.find((s) => s.stop_id === toStopId),
    [routeStops, toStopId]
  );

  // Alighting stops must come AFTER the boarding stop in route order.
  // Everything before or at boarding is disabled.
  const alightingOptions = useMemo(() => {
    const fromIndex = routeStops.findIndex((s) => s.stop_id === fromStopId);
    if (fromIndex === -1) return [];
    return routeStops.slice(fromIndex + 1);
  }, [routeStops, fromStopId]);

  // If the current alighting stop is no longer valid, reset to the next one
  useEffect(() => {
    const fromIndex = routeStops.findIndex((s) => s.stop_id === fromStopId);
    const toIndex = routeStops.findIndex((s) => s.stop_id === toStopId);
    if (toIndex <= fromIndex) {
      const next = routeStops[fromIndex + 1];
      if (next) setToStopId(next.stop_id);
    }
  }, [fromStopId, toStopId, routeStops]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stage === "form") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, onClose]);

  const handlePhoneChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, PHONE_DIGITS);
    setPhoneLocal(digits);
  };

  const submit = async () => {
    if (!fromStop || !toStop) {
      setErrorMsg("Please choose both a boarding and alighting stop.");
      setStage("error");
      return;
    }
    if (!fromStop.boardable) {
      setErrorMsg(
        `Cannot board at ${fromStop.name}: ${reasonLabel(fromStop.unboardable_reason)}.`
      );
      setStage("error");
      return;
    }
    const fromIndex = routeStops.findIndex((s) => s.stop_id === fromStopId);
    const toIndex = routeStops.findIndex((s) => s.stop_id === toStopId);
    if (toIndex <= fromIndex) {
      setErrorMsg("Alighting stop must come after boarding stop.");
      setStage("error");
      return;
    }

    setStage("submitting");
    setErrorMsg(null);

    logBookingSubmitted(bus.trip_id, seats);

    try {
      const response = await requestBooking({
        trip_id: bus.trip_id,
        from_stop_id: fromStopId,
        to_stop_id: toStopId,
        requested_seats: seats,
        passenger_name: name.trim() || undefined,
        passenger_phone: `${PHONE_PREFIX}${phoneLocal}`,
      });

      if (!response.success) {
        setErrorMsg(response.error ?? "Booking failed. Please try again.");
        setStage("error");
        return;
      }

      if (
        response.handoff_id &&
        response.booking_reference &&
        response.pickup_id &&
        response.token &&
        response.expires_at
      ) {
        saveActiveBooking({
          handoff_id: response.handoff_id,
          booking_reference: response.booking_reference,
          pickup_id: response.pickup_id,
          token: response.token,
          expires_at: response.expires_at,
        });
      }

      // Mark confirmed before firing the success event, so the unmount
      // cleanup skips booking_abandoned.
      confirmedRef.current = true;
      if (response.booking_reference) {
        logBookingConfirmed(response.booking_reference, bus.trip_id);
      }

      setResult(response);
      setStage("success");
      onSuccess(response);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Network error. Please try again.";
      setErrorMsg(msg);
      setStage("error");
    }
  };

  const canSubmit =
    name.trim().length >= 2 &&
    phoneLocal.length === PHONE_DIGITS &&
    seats >= 1 &&
    seats <= 10 &&
    Boolean(fromStop) &&
    Boolean(toStop) &&
    fromStop!.boardable === true &&
    routeStops.findIndex((s) => s.stop_id === toStopId) >
      routeStops.findIndex((s) => s.stop_id === fromStopId);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 9999 }}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={stage === "form" ? onClose : undefined}
        style={{ zIndex: 9999 }}
      />

      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl"
        style={{ zIndex: 10000 }}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <div className="text-xs text-neutral-500">Request a seat</div>
            <div className="text-sm font-semibold text-neutral-100">
              {bus.vehicle?.registration_plate ?? "Bus"}
            </div>
          </div>
          {stage === "form" && (
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-4 py-4">
          {stage === "form" && (
            <>
              {/* Trip summary */}
              <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <MapPin className="h-3 w-3" />
                  Trip
                </div>
                <div className="mt-1 text-sm font-medium text-neutral-100">
                  {bus.route?.name ?? "Route"}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {bus.trip_code ?? bus.trip_id.slice(0, 8)}
                  {bus.live?.eta_minutes != null && (
                    <> · {Math.round(bus.live.eta_minutes)} min away</>
                  )}
                </div>
              </div>

              {/* Journey preview */}
              <div className="mb-4 rounded-lg border border-orange-900/40 bg-orange-950/20 p-3">
                <div className="flex items-center gap-2 text-xs text-orange-400/80">
                  <ArrowRight className="h-3 w-3" />
                  Your journey
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <span className="font-medium text-neutral-100">
                    {fromStop?.name ?? "—"}
                  </span>
                  <span className="text-neutral-600">→</span>
                  <span className="font-medium text-neutral-100">
                    {toStop?.name ?? "—"}
                  </span>
                </div>
              </div>

              {/* Boarding stop */}
              <div className="mb-3">
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-400">
                  <MapPin className="h-3 w-3" />
                  Boarding stop
                </label>
                <select
                  value={fromStopId}
                  onChange={(e) => setFromStopId(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-orange-600 focus:outline-none"
                >
                  {routeStops.map((stop) => {
                    const disabled = !stop.boardable;
                    return (
                      <option
                        key={stop.stop_id}
                        value={stop.stop_id}
                        disabled={disabled}
                      >
                        {stop.name}
                        {disabled
                          ? ` — ${reasonLabel(stop.unboardable_reason)}`
                          : ""}
                      </option>
                    );
                  })}
                </select>
                {fromStop && !fromStop.boardable && (
                  <div className="mt-1 flex items-center gap-1 text-xs text-amber-400">
                    <Ban className="h-3 w-3" />
                    {reasonLabel(fromStop.unboardable_reason)}
                  </div>
                )}
              </div>

              {/* Alighting stop */}
              <div className="mb-3">
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-400">
                  <MapPin className="h-3 w-3" />
                  Alighting stop
                </label>
                <select
                  value={toStopId}
                  onChange={(e) => setToStopId(e.target.value)}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-orange-600 focus:outline-none"
                >
                  {alightingOptions.map((stop) => (
                    <option key={stop.stop_id} value={stop.stop_id}>
                      {stop.name}
                    </option>
                  ))}
                </select>
                {alightingOptions.length === 0 && (
                  <div className="mt-1 text-xs text-amber-400">
                    No stops available after your boarding stop.
                  </div>
                )}
              </div>

              {/* Name */}
              <div className="mb-3">
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-400">
                  <User className="h-3 w-3" />
                  Full name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name Surname"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-orange-600 focus:outline-none"
                />
              </div>

              {/* Phone */}
              <div className="mb-3">
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-400">
                  <Phone className="h-3 w-3" />
                  Phone number
                </label>
                <div className="flex overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 focus-within:border-orange-600">
                  <span className="flex items-center border-r border-neutral-700 bg-neutral-950 px-3 text-sm font-mono text-neutral-400">
                    {PHONE_PREFIX}
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phoneLocal}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="71234567"
                    maxLength={PHONE_DIGITS}
                    className="flex-1 bg-transparent px-3 py-2 text-sm font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
                  />
                  <span className="flex items-center px-3 text-xs text-neutral-500">
                    {phoneLocal.length}/{PHONE_DIGITS}
                  </span>
                </div>
              </div>

              {/* Seats */}
              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium text-neutral-400">
                  Number of seats
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSeats((s) => Math.max(1, s - 1))}
                    disabled={seats <= 1}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-700 text-neutral-200 transition-colors hover:bg-neutral-800 disabled:opacity-40"
                  >
                    −
                  </button>
                  <div className="flex h-9 min-w-[3rem] items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-sm font-semibold text-neutral-100">
                    {seats}
                  </div>
                  <button
                    onClick={() => setSeats((s) => Math.min(10, s + 1))}
                    disabled={seats >= 10}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-700 text-neutral-200 transition-colors hover:bg-neutral-800 disabled:opacity-40"
                  >
                    +
                  </button>
                  <span className="ml-2 text-xs text-neutral-500">
                    <Users className="mr-1 inline h-3 w-3" />
                    Max 10
                  </span>
                </div>
              </div>

              <div className="mb-4 rounded-lg border border-amber-900/40 bg-amber-950/30 p-3 text-xs text-amber-200">
                You pay cash to the driver when you board. The driver will
                confirm your request and give you a 6-digit PIN.
              </div>

              <button
                onClick={submit}
                disabled={!canSubmit}
                className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Request seat{seats > 1 ? "s" : ""}
              </button>
            </>
          )}

          {stage === "submitting" && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-orange-500" />
              <div className="text-sm font-medium text-neutral-200">
                Sending request…
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Contacting driver
              </div>
            </div>
          )}

          {stage === "success" && result && (
            <div className="text-center">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-500" />
              <div className="text-lg font-bold text-neutral-100">
                Request sent
              </div>
              <div className="mt-1 text-sm text-neutral-400">
                Waiting for the driver to accept
              </div>

              <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 text-left">
                <div className="text-xs text-neutral-500">
                  Booking reference
                </div>
                <div className="mt-1 font-mono text-lg font-bold text-orange-400">
                  {result.booking_reference}
                </div>
                <div className="mt-2 text-xs text-neutral-500">
                  Save this to recover your booking if your device loses data.
                </div>
              </div>

              <button
                onClick={onClose}
                className="mt-4 w-full rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800"
              >
                Done
              </button>
            </div>
          )}

          {stage === "error" && (
            <div className="text-center">
              <AlertCircle className="mx-auto mb-3 h-12 w-12 text-red-500" />
              <div className="text-lg font-bold text-neutral-100">
                Booking failed
              </div>
              <div className="mt-2 text-sm text-neutral-400">{errorMsg}</div>
              <button
                onClick={() => setStage("form")}
                className="mt-4 w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-500"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}