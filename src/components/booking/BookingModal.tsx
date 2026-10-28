"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  X, Loader2, CheckCircle2, AlertCircle, Users, MapPin, Phone, User, ArrowRight, Ban, Armchair
} from "lucide-react";
import {
  requestBooking, saveActiveBooking, recoverActiveBooking, RequestTimeoutError, type BookingResponse,
} from "@/lib/passengerBookingApi";
import type { PublicBus, PublicStop } from "@/lib/passengerApi";
import { createClient } from "@supabase/supabase-js";
import { logBookingStarted, logBookingSubmitted, logBookingConfirmed, logBookingAbandoned } from "@/lib/events";
import { PassengerSeatMap, type DbSeat } from "./PassengerSeatMap";

interface BookingModalProps {
  bus: PublicBus;
  routeStops: PublicStop[];
  onClose: () => void;
  onSuccess: (response: BookingResponse) => void;
}

type Stage = "form" | "seat-selection" | "submitting" | "success" | "error";

const ENABLE_SEAT_SELECTION = true;
const PHONE_PREFIX = "+267";
const PHONE_DIGITS = 8;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://hzmpncdygkeqvoszunfm.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_o2CPNKg49wAwJysjiGp08A_V0ZYeZjH";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function reasonLabel(reason: PublicStop["unboardable_reason"]): string {
  switch (reason) {
    case "bus_passed": return "Bus already passed";
    case "too_close": return "Bus arriving too soon";
    case "destination": return "Final stop";
    case "off_route": return "Not on route";
    default: return "Unavailable";
  }
}

export function BookingModal({ bus, routeStops, onClose, onSuccess }: BookingModalProps) {
  const [stage, setStage] = useState<Stage>("form");
  const [name, setName] = useState("");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [seats, setSeats] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<BookingResponse | null>(null);
  const [slowNet, setSlowNet] = useState(false);

  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [dbSeats, setDbSeats] = useState<DbSeat[]>([]);
  const [bookedSeatIds, setBookedSeatIds] = useState<string[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [driverSide, setDriverSide] = useState<"LEFT" | "RIGHT">("RIGHT");
  const [seatConfig, setSeatConfig] = useState<any>(null);
  // true = the operator has not created a seat map for this bus yet
  const [noSeatMap, setNoSeatMap] = useState(false);

  const confirmedRef = useRef(false);
  const abandonedFiredRef = useRef(false);

  const boardableStops = useMemo(() => routeStops.filter((s) => s.boardable), [routeStops]);
  const hasAnyBoardableStop = boardableStops.length > 0;

  const defaultFromId = useMemo(() => {
    if (bus.segment_availability?.from_stop_id) {
      const match = routeStops.find((s) => s.stop_id === bus.segment_availability!.from_stop_id && s.boardable);
      if (match) return match.stop_id;
    }
    const firstBoardable = routeStops.find((s) => s.boardable);
    return firstBoardable?.stop_id ?? "";
  }, [bus.segment_availability, routeStops]);

  const defaultToId = useMemo(() => {
    if (bus.segment_availability?.to_stop_id) {
      const match = routeStops.find((s) => s.stop_id === bus.segment_availability!.to_stop_id);
      if (match) return match.stop_id;
    }
    return routeStops[routeStops.length - 1]?.stop_id ?? "";
  }, [bus.segment_availability, routeStops]);

  const [fromStopId, setFromStopId] = useState<string>(defaultFromId);
  const [toStopId, setToStopId] = useState<string>(defaultToId);

  useEffect(() => {
    logBookingStarted(bus.trip_id, defaultFromId || null, defaultToId || null);
    return () => {
      if (!confirmedRef.current && !abandonedFiredRef.current) {
        abandonedFiredRef.current = true;
        logBookingAbandoned(bus.trip_id, "form_open");
      }
    };
  }, [bus.trip_id]);

  useEffect(() => {
    if (!fromStopId) return;
    const fromStop = routeStops.find((s) => s.stop_id === fromStopId);
    if (!fromStop || !fromStop.boardable) setFromStopId(defaultFromId);
  }, [defaultFromId, fromStopId, routeStops]);

  const fromStop = useMemo(() => routeStops.find((s) => s.stop_id === fromStopId), [routeStops, fromStopId]);
  const toStop = useMemo(() => routeStops.find((s) => s.stop_id === toStopId), [routeStops, toStopId]);

  const alightingOptions = useMemo(() => {
    const fromIndex = routeStops.findIndex((s) => s.stop_id === fromStopId);
    if (fromIndex === -1) return [];
    return routeStops.slice(fromIndex + 1);
  }, [routeStops, fromStopId]);

  useEffect(() => {
    if (!fromStopId) return;
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
    return () => { document.body.style.overflow = original; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stage === "form") onClose();
      if (e.key === "Escape" && stage === "seat-selection") setStage("form");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, onClose]);

  const handlePhoneChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, PHONE_DIGITS);
    setPhoneLocal(digits);
  };

  // Find out up front whether this bus has a seat map, so the passenger is
  // never sent to a seat picker that cannot open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const plate = bus.vehicle?.registration_plate;
        if (!plate) return;
        const { data: v } = await supabase
          .from("vehicles")
          .select("id")
          .eq("registration_plate", plate)
          .maybeSingle();
        if (!v?.id || cancelled) return;
        const { count, error } = await supabase
          .from("vehicle_seats")
          .select("id", { count: "exact", head: true })
          .eq("vehicle_id", v.id);
        if (cancelled || error) return;
        setNoSeatMap((count ?? 0) === 0);
      } catch {
        // If this check fails, fall back to the normal seat picker.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bus.vehicle?.registration_plate]);

  const proceedToSeats = async () => {
    setStage("seat-selection");
    setLoadingSeats(true);

    try {
      const plate = bus.vehicle?.registration_plate;
      if (!plate) throw new Error("No vehicle plate found on this bus.");

      const { data: vehicleData, error: vErr } = await supabase
        .from("vehicles")
        .select("id, seat_config")
        .eq("registration_plate", plate)
        .single();

      if (vErr) throw new Error(`Vehicle lookup failed: ${vErr.message}`);
      if (!vehicleData) throw new Error(`No vehicle found with plate ${plate}`);

      if (vehicleData.seat_config) {
        setSeatConfig(vehicleData.seat_config);
        setDriverSide(vehicleData.seat_config.driverSide || "RIGHT");
      }

      const { data: seatsData, error: sErr } = await supabase
        .from("vehicle_seats")
        .select("id, seat_number, row_number, column_number, seat_type")
        .eq("vehicle_id", vehicleData.id)
        .order("seat_number", { ascending: true });

      if (sErr) throw new Error(`Seat fetch failed: ${sErr.message}`);
      if (!seatsData || seatsData.length === 0) {
        // No seat map made by the operator: book without choosing a seat.
        setNoSeatMap(true);
        setSelectedSeatIds([]);
        setStage("form");
        return;
      }

      setDbSeats(seatsData as DbSeat[]);

      // Taken seats = app bookings + walk-ups, combined by the database
      const { data: takenIds, error: tErr } = await supabase.rpc("get_taken_seat_ids", {
        p_trip_id: bus.trip_id,
      });
      if (tErr) throw new Error(`Seat availability failed: ${tErr.message}`);
      setBookedSeatIds((takenIds as string[] | null) ?? []);
    } catch (err: any) {
      console.error("Seat Map Error:", err);
      setErrorMsg("Could not load seat map: " + err.message);
      setStage("form");
    } finally {
      setLoadingSeats(false);
    }
  };

  const confirmSeats = () => {
    if (selectedSeatIds.length !== seats) {
      setErrorMsg(`Please select exactly ${seats} seats.`);
      return;
    }
    setErrorMsg(null);
    setStage("form");
  };

  const finishSuccess = (response: BookingResponse) => {
    if (response.handoff_id && response.booking_reference && response.pickup_id && response.expires_at) {
      saveActiveBooking({
        handoff_id: response.handoff_id,
        booking_reference: response.booking_reference,
        pickup_id: response.pickup_id,
        token: response.token ?? "",
        expires_at: response.expires_at,
      });
    }
    confirmedRef.current = true;
    if (response.booking_reference) logBookingConfirmed(response.booking_reference, bus.trip_id);
    setResult(response);
    setStage("success");
    onSuccess(response);
  };

  const submit = async () => {
    if (!fromStop || !toStop) {
      setErrorMsg("Please choose both a boarding and alighting stop.");
      setStage("error");
      return;
    }
    if (!fromStop.boardable) {
      setErrorMsg(`Cannot board at ${fromStop.name}: ${reasonLabel(fromStop.unboardable_reason)}.`);
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
    setSlowNet(false);
    logBookingSubmitted(bus.trip_id, seats);
    const slowTimer = setTimeout(() => setSlowNet(true), 8000);
    const phone = `${PHONE_PREFIX}${phoneLocal}`;

    try {
      const response = await requestBooking({
        trip_id: bus.trip_id,
        from_stop_id: fromStopId,
        to_stop_id: toStopId,
        requested_seats: seats,
        passenger_name: name.trim() || undefined,
        passenger_phone: phone,
        seat_ids: selectedSeatIds.length > 0 ? selectedSeatIds : undefined,
      });

      if (!response.success) {
        setErrorMsg(response.error ?? "Booking failed. Please try again.");
        setStage("error");
        return;
      }
      finishSuccess(response);
    } catch (e: unknown) {
      // The network failed or timed out, but the request may still have
      // reached the server. Check before telling the passenger it failed.
      const recovered = await recoverActiveBooking(phone);
      if (recovered) {
        finishSuccess(recovered);
        return;
      }
      setErrorMsg(
        e instanceof RequestTimeoutError
          ? "Your connection is very slow and we could not confirm your request. Please check your connection and try again."
          : "Could not reach the server. Please check your connection and try again."
      );
      setStage("error");
    } finally {
      clearTimeout(slowTimer);
      setSlowNet(false);
    }
  };

  const canSubmit =
    name.trim().length >= 2 &&
    phoneLocal.length === PHONE_DIGITS &&
    seats >= 1 && seats <= 10 &&
    Boolean(fromStop) && Boolean(toStop) &&
    fromStop!.boardable === true &&
    routeStops.findIndex((s) => s.stop_id === toStopId) > routeStops.findIndex((s) => s.stop_id === fromStopId) &&
    (!ENABLE_SEAT_SELECTION || noSeatMap || selectedSeatIds.length === seats);

  const journeyReady = Boolean(fromStop) && Boolean(toStop);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={stage === "form" ? onClose : undefined} style={{ zIndex: 9999 }} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl" style={{ zIndex: 10000 }}>
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div>
            <div className="text-xs text-neutral-500">{stage === "seat-selection" ? "Select your seats" : "Request a seat"}</div>
            <div className="text-sm font-semibold text-neutral-100">{bus.vehicle?.registration_plate ?? "Bus"}</div>
          </div>
          {stage !== "submitting" && (
            <button onClick={() => stage === "seat-selection" ? setStage("form") : onClose()} className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-4 py-4">
          {stage === "form" && (
            <>
              <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
                <div className="flex items-center gap-2 text-xs text-neutral-500"><MapPin className="h-3 w-3" /> Trip</div>
                <div className="mt-1 text-sm font-medium text-neutral-100">{bus.route?.name ?? "Route"}</div>
              </div>
              <div className="mb-4 rounded-lg border border-orange-900/40 bg-orange-950/20 p-3">
                <div className="flex items-center gap-2 text-xs text-orange-400/80"><ArrowRight className="h-3 w-3" /> Your journey</div>
                {journeyReady ? (
                  <div className="mt-1 flex items-center gap-2 text-sm">
                    <span className="font-medium text-neutral-100">{fromStop!.name}</span>
                    <span className="text-neutral-600">→</span>
                    <span className="font-medium text-neutral-100">{toStop!.name}</span>
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-neutral-400">{hasAnyBoardableStop ? "Select a boarding and alighting stop to see your journey." : "No stops are currently available to board on this bus."}</div>
                )}
              </div>
              <div className="mb-3">
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-400"><MapPin className="h-3 w-3" /> Boarding stop</label>
                <select value={fromStopId} onChange={(e) => setFromStopId(e.target.value)} disabled={!hasAnyBoardableStop} className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-orange-600 focus:outline-none disabled:opacity-50">
                  {!hasAnyBoardableStop && <option value="">No stops available to board right now</option>}
                  {hasAnyBoardableStop && !fromStopId && <option value="">Select a boarding stop…</option>}
                  {routeStops.map((stop) => (
                    <option key={stop.stop_id} value={stop.stop_id} disabled={!stop.boardable}>
                      {stop.name} {!stop.boardable ? `— ${reasonLabel(stop.unboardable_reason)}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-3">
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-400"><MapPin className="h-3 w-3" /> Alighting stop</label>
                <select value={toStopId} onChange={(e) => setToStopId(e.target.value)} disabled={!fromStopId || alightingOptions.length === 0} className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-orange-600 focus:outline-none disabled:opacity-50">
                  {(!fromStopId || alightingOptions.length === 0) && <option value="">{fromStopId ? "No stops available after your boarding stop." : "Select a boarding stop first."}</option>}
                  {alightingOptions.map((stop) => <option key={stop.stop_id} value={stop.stop_id}>{stop.name}</option>)}
                </select>
              </div>
              <div className="mb-3">
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-400"><User className="h-3 w-3" /> Full name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name Surname" className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-orange-600 focus:outline-none" />
              </div>
              <div className="mb-3">
                <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-400"><Phone className="h-3 w-3" /> Phone number</label>
                <div className="flex overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 focus-within:border-orange-600">
                  <span className="flex items-center border-r border-neutral-700 bg-neutral-950 px-3 text-sm font-mono text-neutral-400">{PHONE_PREFIX}</span>
                  <input type="tel" inputMode="numeric" value={phoneLocal} onChange={(e) => handlePhoneChange(e.target.value)} placeholder="71234567" maxLength={PHONE_DIGITS} className="flex-1 bg-transparent px-3 py-2 text-sm font-mono text-neutral-100 placeholder:text-neutral-600 focus:outline-none" />
                </div>
              </div>
              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium text-neutral-400">Number of seats</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSeats((s) => Math.max(1, s - 1))} disabled={seats <= 1} className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-700 text-neutral-200 transition-colors hover:bg-neutral-800 disabled:opacity-40">−</button>
                  <div className="flex h-9 min-w-[3rem] items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 px-3 text-sm font-semibold text-neutral-100">{seats}</div>
                  <button onClick={() => setSeats((s) => Math.min(10, s + 1))} disabled={seats >= 10} className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-700 text-neutral-200 transition-colors hover:bg-neutral-800 disabled:opacity-40">+</button>
                </div>
              </div>
              {ENABLE_SEAT_SELECTION && noSeatMap && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-xs text-neutral-300">
                  <Armchair className="mt-0.5 h-4 w-4 flex-shrink-0 text-neutral-400" />
                  <span>
                    This bus has no seat map yet, so you cannot pick a seat. The driver will assign your seat{seats > 1 ? "s" : ""} when you board.
                  </span>
                </div>
              )}
              {ENABLE_SEAT_SELECTION && !noSeatMap && (
                <div className="mb-4">
                  <button onClick={proceedToSeats} className={`w-full flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${selectedSeatIds.length === seats ? "border-green-700/50 bg-green-950/20 text-green-400 hover:bg-green-950/40" : "border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"}`}>
                    <Armchair className="h-4 w-4" />
                    {selectedSeatIds.length === seats ? `${seats} Seat${seats > 1 ? "s" : ""} Selected` : `Choose ${seats} seat${seats > 1 ? "s" : ""}`}
                  </button>
                </div>
              )}
              <div className="mb-4 rounded-lg border border-amber-900/40 bg-amber-950/30 p-3 text-xs text-amber-200">
                You pay cash to the driver when you board. The driver will confirm your request and give you a 6-digit PIN.
              </div>
              <button onClick={submit} disabled={!canSubmit} className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40">
                Request seat{seats > 1 ? "s" : ""}
              </button>
            </>
          )}
          {stage === "seat-selection" && (
            <div className="py-2">
              {loadingSeats ? (
                <div className="flex h-64 flex-col items-center justify-center text-neutral-500">
                  <Loader2 className="h-6 w-6 animate-spin mb-2" />
                  <span className="text-sm">Loading bus floor plan...</span>
                </div>
              ) : (
                <PassengerSeatMap
                  seats={dbSeats}
                  selectedSeatIds={selectedSeatIds}
                  bookedSeatIds={bookedSeatIds}
                  maxSeats={seats}
                  driverSide={driverSide}
                  seatConfig={seatConfig}
                  onToggleSeat={(id) => {
                    setSelectedSeatIds((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
                  }}
                />
              )}
              <div className="mt-6 flex gap-2">
                <button onClick={() => setStage("form")} className="flex-1 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-200 hover:bg-neutral-800">Back</button>
                <button onClick={confirmSeats} disabled={selectedSeatIds.length !== seats || loadingSeats} className="flex-1 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50">Confirm {seats} seat{seats > 1 ? "s" : ""}</button>
              </div>
            </div>
          )}
          {stage === "submitting" && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-orange-500" />
              <div className="text-sm font-medium text-neutral-200">Sending request…</div>
              {slowNet && (
                <div className="mt-2 max-w-xs text-center text-xs text-amber-300">
                  Slow connection. Still working, please keep this window open.
                </div>
              )}
            </div>
          )}
          {stage === "success" && result && (
            <div className="text-center">
              <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-500" />
              <div className="text-lg font-bold text-neutral-100">Request sent</div>
              <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 text-left">
                <div className="text-xs text-neutral-500">Booking reference</div>
                <div className="mt-1 font-mono text-lg font-bold text-orange-400">{result.booking_reference}</div>
              </div>
              <button onClick={onClose} className="mt-4 w-full rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-800">Done</button>
            </div>
          )}
          {stage === "error" && (
            <div className="text-center">
              <AlertCircle className="mx-auto mb-3 h-12 w-12 text-red-500" />
              <div className="text-lg font-bold text-neutral-100">Booking failed</div>
              <div className="mt-2 text-sm text-neutral-400">{errorMsg}</div>
              <button onClick={() => setStage("form")} className="mt-4 w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-500">Try again</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}