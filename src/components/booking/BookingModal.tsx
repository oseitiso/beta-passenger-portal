"use client";

import { useState, useEffect } from "react";
import {
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Users,
  MapPin,
  Phone,
  User,
} from "lucide-react";
import {
  requestBooking,
  saveActiveBooking,
  type BookingResponse,
} from "@/lib/passengerBookingApi";
import type { PublicBus } from "@/lib/passengerApi";

interface BookingModalProps {
  bus: PublicBus;
  fromStopId: string;
  fromStopName: string;
  toStopId: string;
  toStopName: string;
  onClose: () => void;
  onSuccess: (response: BookingResponse) => void;
}

type Stage = "form" | "submitting" | "success" | "error";

const PHONE_PREFIX = "+267";
const PHONE_DIGITS = 8; // Botswana mobile numbers

export function BookingModal({
  bus,
  fromStopId,
  fromStopName,
  toStopId,
  toStopName,
  onClose,
  onSuccess,
}: BookingModalProps) {
  const [stage, setStage] = useState<Stage>("form");
  const [name, setName] = useState("");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [seats, setSeats] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<BookingResponse | null>(null);

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
    // Strip all non-digits, cap at PHONE_DIGITS
    const digits = raw.replace(/\D/g, "").slice(0, PHONE_DIGITS);
    setPhoneLocal(digits);
  };

  const submit = async () => {
    setStage("submitting");
    setErrorMsg(null);

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
    seats <= 10;

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

        <div className="px-4 py-4">
          {stage === "form" && (
            <>
              {/* Route summary */}
              <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <MapPin className="h-3 w-3" />
                  Route
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <span className="font-medium text-neutral-100">
                    {fromStopName}
                  </span>
                  <span className="text-neutral-600">→</span>
                  <span className="font-medium text-neutral-100">
                    {toStopName}
                  </span>
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {bus.trip_code ?? bus.trip_id.slice(0, 8)} ·{" "}
                  {Math.round(bus.live?.eta_minutes ?? 0)} min away
                </div>
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

              {/* Phone with fixed +267 prefix */}
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
                onClick={() => {
                  onClose();
                }}
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