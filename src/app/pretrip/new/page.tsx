"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import {
  fetchPretripSeats,
  bookPretrip,
  addPretripRef,
  getPretripContact,
  setPretripContact,
  formatDay,
  type PretripSeatPlan,
} from "@/lib/pretrip";
import { PassengerSeatMap } from "@/components/booking/PassengerSeatMap";
import { formatTime } from "@/lib/upcoming";
import { pushSupported } from "@/lib/push";

function NewPretrip() {
  const router = useRouter();
  const params = useSearchParams();
  const tripId = params.get("trip") ?? "";
  const toId = params.get("to") ?? "";
  const operator = params.get("o") ?? "";
  const route = params.get("r") ?? "";
  const departs = params.get("t") ?? "";
  const toName = params.get("tn") ?? "";
  const fromName = params.get("fn") ?? "";
  const validTime = departs && !Number.isNaN(Date.parse(departs));

  const [plan, setPlan] = useState<PretripSeatPlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [remind, setRemind] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = getPretripContact();
    setName(c.name);
    setPhone(c.phone);
    if (!tripId || !toId) {
      setLoadError("This link is incomplete. Go back to Upcoming trips and try again.");
      return;
    }
    fetchPretripSeats(tripId, toId).then((r) => {
      if (r.error) setLoadError(r.error);
      else setPlan(r);
    });
  }, [tripId, toId]);

  const seats = plan?.seats ?? null;
  const takenIds = (seats ?? []).filter((x) => x.taken).map((x) => x.id);
  const pickedNumbers = (seats ?? []).filter((x) => picked.includes(x.id)).map((x) => x.seat_number);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? p : [...p, id]));
  }

  async function submit() {
    setError(null);
    if (picked.length === 0) return setError("Choose 1 or 2 seats.");
    if (name.trim().length < 2) return setError("Enter your name.");
    if (!/^\+?(267)?\s?\d{8}$/.test(phone.replace(/[\s-]/g, ""))) return setError("Enter your 8-digit phone number.");
    setBusy(true);
    const r = await bookPretrip({ tripId, toStopId: toId, seatIds: picked, name: name.trim(), phone, remind });
    setBusy(false);
    if (!r.ok || !r.reference) {
      setError(r.error ?? "Could not save the request.");
      const again = await fetchPretripSeats(tripId, toId);
      if (!again.error) {
        setPlan(again);
        setPicked((p) => p.filter((id) => again.seats.some((s) => s.id === id && !s.taken)));
      }
      return;
    }
    setPretripContact(name.trim(), phone);
    addPretripRef(r.reference);
    router.push("/pretrip");
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 focus:border-orange-500 focus:outline-none";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center pt-6 pb-20">
      <header className="w-full max-w-2xl px-4 mb-6 flex items-center justify-between">
        <Link href="/upcoming" className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-100">
          <ArrowLeft className="h-4 w-4" />
          Upcoming trips
        </Link>
        <div className="text-xs text-neutral-500">Request a seat</div>
      </header>

      <main className="w-full max-w-2xl px-4">
        <h1 className="text-3xl font-bold">Choose your seat</h1>
        <p className="mt-2 text-sm text-neutral-400">
          {[operator, route].filter(Boolean).join(" - ")}
          {validTime ? " - " + formatDay(departs) + ", " + formatTime(departs) : ""}
          {toName ? " - to " + toName : ""}
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          Your seat is held for you. On the departure day, be at {fromName || "the first stop"} at least 15 to 60
          minutes before departure and claim it in B-ETA. Seats that are not claimed are released to other passengers.
        </p>

        {loadError ? (
          <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{loadError}</span>
          </div>
        ) : !seats ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-2xl border border-neutral-700/60 bg-neutral-900 p-4">
              <div className="mb-2 text-center text-[11px] text-neutral-500">Choose up to 2 seats</div>
              <PassengerSeatMap
                seats={seats}
                selectedSeatIds={picked}
                bookedSeatIds={takenIds}
                onToggleSeat={toggle}
                maxSeats={2}
                driverSide={plan?.driverSide ?? "RIGHT"}
                seatConfig={plan?.seatConfig ?? null}
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs text-neutral-400">
                Your name
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputCls} />
              </label>
              <label className="text-xs text-neutral-400">
                Phone number
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  placeholder="71234567"
                  className={inputCls}
                />
              </label>
            </div>

            {pushSupported() && (
              <label className="mt-4 flex items-start gap-2 text-sm text-neutral-300">
                <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} className="mt-1" />
                <span>Remind me when it is time to claim my seat</span>
              </label>
            )}

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={submit}
              disabled={busy || picked.length === 0}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {pickedNumbers.length > 0 ? "Hold seat " + pickedNumbers.join(" and ") : "Choose a seat"}
            </button>
          </>
        )}
      </main>
    </div>
  );
}

export default function NewPretripPage() {
  return (
    <Suspense fallback={null}>
      <NewPretrip />
    </Suspense>
  );
}