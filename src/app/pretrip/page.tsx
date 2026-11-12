"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle, Loader2, MapPin, Ticket } from "lucide-react";
import {
  fetchPretrip,
  claimPretrip,
  cancelPretripRequest,
  getPretripRefs,
  removePretripRef,
  distanceMeters,
  formatDay,
  formatCountdown,
  type PretripView,
} from "@/lib/pretrip";
import { formatTime } from "@/lib/upcoming";

interface Pos {
  lat: number;
  lng: number;
  accuracy: number;
}

export default function MyPretripPage() {
  const [views, setViews] = useState<Record<string, PretripView>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [refs, setRefs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [pos, setPos] = useState<Pos | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const lastTry = useRef<Record<string, number>>({});

  const load = useCallback(async () => {
    const list = getPretripRefs();
    setRefs(list);
    const out: Record<string, PretripView> = {};
    const gone: string[] = [];
    await Promise.all(
      list.map(async (r) => {
        const res = await fetchPretrip(r);
        if (res.view) {
          out[r] = res.view;
          setOffset(Date.parse(res.view.server_now) - Date.now());
        } else if (res.error === "Booking not found.") gone.push(r);
      })
    );
    setViews(out);
    setMissing(gone);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 20000);
    return () => clearInterval(poll);
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const serverNow = now + offset;
  const inWindow = (v: PretripView) =>
    v.state === "HELD" && serverNow >= Date.parse(v.claim_opens_at) && serverNow < Date.parse(v.claim_deadline_at);
  const needWatch = Object.values(views).some(inWindow);

  // Watch the position only while a claim window is open (the page must stay open).
  useEffect(() => {
    if (!needWatch || typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGeoDenied(false);
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      (e) => {
        if (e.code === 1) setGeoDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [needWatch]);

  // Claim automatically when the passenger reaches the stop.
  useEffect(() => {
    if (!pos || pos.accuracy > 200) return;
    Object.values(views).forEach((v) => {
      if (!inWindow(v) || v.from_lat == null || v.from_lng == null) return;
      const d = distanceMeters(pos.lat, pos.lng, v.from_lat, v.from_lng);
      const last = lastTry.current[v.reference] ?? 0;
      if (d <= v.claim_radius_m && Date.now() - last > 15000) {
        lastTry.current[v.reference] = Date.now();
        claimPretrip(v.reference, pos.lat, pos.lng, pos.accuracy, "GEOFENCE_AUTO").then(() => void load());
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos]);

  function getOnePosition(): Promise<Pos | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  async function claimNow(v: PretripView) {
    setNote(null);
    setBusyRef(v.reference);
    const p = await getOnePosition();
    if (!p) {
      setBusyRef(null);
      setGeoDenied(true);
      setNote("Allow location for B-ETA so we can see that you are at the stop.");
      return;
    }
    const r = await claimPretrip(v.reference, p.lat, p.lng, p.accuracy, "GEOFENCE_TAP");
    setBusyRef(null);
    if (!r.ok) setNote(r.error ?? "Could not claim the seat.");
    await load();
  }

  async function cancel(v: PretripView) {
    if (!window.confirm("Give up seat " + v.seat_numbers.join(", ") + "?")) return;
    setBusyRef(v.reference);
    const r = await cancelPretripRequest(v.reference);
    setBusyRef(null);
    if (!r.ok) setNote(r.error ?? "Could not cancel.");
    await load();
  }

  function dismiss(ref: string) {
    removePretripRef(ref);
    void load();
  }

  const ordered = refs.map((r) => views[r]).filter(Boolean) as PretripView[];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center pt-6 pb-20">
      <header className="w-full max-w-2xl px-4 mb-6 flex items-center justify-between">
        <Link href="/upcoming" className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-100">
          <ArrowLeft className="h-4 w-4" />
          Upcoming trips
        </Link>
        <div className="text-xs text-neutral-500">My seats</div>
      </header>

      <main className="w-full max-w-2xl px-4">
        <h1 className="text-3xl font-bold">My seats</h1>
        <p className="mt-2 mb-5 text-sm text-neutral-400">
          Claim your seat at the first stop between 60 and 15 minutes before departure. Keep B-ETA open while you
          walk to the stop.
        </p>

        {note && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{note}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          </div>
        ) : ordered.length === 0 ? (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-8 text-center">
            <Ticket className="mx-auto mb-3 h-10 w-10 text-neutral-600" />
            <div className="text-lg font-semibold">No seats held</div>
            <div className="mt-2 text-sm text-neutral-400">
              Search Upcoming trips from the first stop of a route to hold a seat in advance.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {ordered.map((v) => {
              const opens = Date.parse(v.claim_opens_at);
              const deadline = Date.parse(v.claim_deadline_at);
              const open = inWindow(v);
              const dist =
                pos && v.from_lat != null && v.from_lng != null
                  ? Math.round(distanceMeters(pos.lat, pos.lng, v.from_lat, v.from_lng))
                  : null;
              const done = v.state === "RELEASED" || v.state === "CANCELLED";
              return (
                <div
                  key={v.reference}
                  className="relative w-full overflow-hidden rounded-2xl border border-neutral-700/60 bg-neutral-900 shadow-xl"
                >
                  <div className="flex items-center justify-between bg-gradient-to-r from-yellow-500 to-orange-500 px-4 py-1.5 text-black">
                    <h2 className="truncate text-[11px] font-black uppercase tracking-[0.2em]">
                      {v.operator ?? "Operator"}
                    </h2>
                    <span className="text-[10px] font-extrabold tracking-widest opacity-70">
                      {v.state === "BOARDED" ? "BOARDED" : v.state === "CLAIMED" ? "TICKET" : "SEAT HELD"}
                    </span>
                  </div>

                  <div className="px-4 pt-3 pb-4">
                    <div className="text-xs text-neutral-400">{v.route}</div>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[9px] font-semibold uppercase tracking-widest text-neutral-500">Departs</div>
                        <div className="text-base font-bold text-white">
                          {formatDay(v.departs_at)}, {formatTime(v.departs_at)}
                        </div>
                        <div className="truncate text-xs text-neutral-400">
                          {v.from_name} to {v.to_name}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] font-semibold uppercase tracking-widest text-neutral-500">
                          {v.seat_numbers.length > 1 ? "Seats" : "Seat"}
                        </div>
                        <div className="text-4xl font-black leading-none text-orange-400">
                          {v.seat_numbers.join(" + ")}
                        </div>
                      </div>
                    </div>

                    {v.state === "CLAIMED" && (
                      <div className="mt-4 rounded-xl border border-green-900/50 bg-green-950/40 p-3 text-center">
                        <div className="text-sm font-semibold text-green-300">Seat confirmed</div>
                        <div className="mt-1 text-xs text-green-200/80">
                          Show this ticket to the conductor. {v.name ? v.name + " - " : ""}Ref {v.reference}
                        </div>
                      </div>
                    )}

                    {v.state === "BOARDED" && (
                      <div className="mt-4 rounded-xl border border-green-900/50 bg-green-950/40 p-3 text-center">
                        <div className="text-sm font-semibold text-green-300">You have boarded</div>
                        <div className="mt-1 text-xs text-green-200/80">Have a good trip. Ref {v.reference}</div>
                      </div>
                    )}

                    {v.state === "HELD" && !open && serverNow < opens && (
                      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 text-sm text-neutral-300">
                        Claiming opens at {formatTime(v.claim_opens_at)}, in {formatCountdown(opens - serverNow)}.
                      </div>
                    )}

                    {v.state === "HELD" && open && (
                      <div className="mt-4 rounded-xl border border-orange-900/50 bg-orange-950/30 p-3">
                        <div className="text-sm font-semibold text-orange-300">
                          Claim your seat within {formatCountdown(deadline - serverNow)}
                        </div>
                        <div className="mt-1 text-xs text-neutral-300">
                          Be at {v.from_name} and this ticket will confirm by itself when you arrive.
                          {dist != null ? " You are about " + dist + " m away." : ""}
                        </div>
                        {geoDenied && (
                          <div className="mt-2 text-xs text-red-300">
                            Location is off for B-ETA. Turn it on, or tell the conductor your PIN below.
                          </div>
                        )}
                        <button
                          onClick={() => claimNow(v)}
                          disabled={busyRef === v.reference}
                          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
                        >
                          {busyRef === v.reference ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MapPin className="h-4 w-4" />
                          )}
                          I am at the stop
                        </button>
                      </div>
                    )}

                    {v.state === "HELD" && !open && serverNow >= deadline && (
                      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 text-sm text-neutral-300">
                        The claim window has closed. This seat is being released.
                      </div>
                    )}

                    {done && (
                      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3 text-sm text-neutral-300">
                        {v.state === "CANCELLED"
                          ? "You gave up this seat."
                          : v.release_reason === "UNCLAIMED"
                          ? "This seat was released because it was not claimed in time. You can still request a seat on the map when the bus starts."
                          : v.release_reason === "BUS_LEFT_EARLY"
                          ? "The bus left early and the seat was released. Open the map to request a seat."
                          : "The trip changed or was cancelled, so this seat was released."}
                      </div>
                    )}

                    {(v.state === "HELD" || v.state === "CLAIMED") && (
                      <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                        <span>
                          PIN {v.pin} (give it to the conductor if this ticket does not confirm)
                        </span>
                        <button
                          onClick={() => cancel(v)}
                          disabled={busyRef === v.reference}
                          className="rounded-md border border-neutral-700 px-2 py-1 text-neutral-300 hover:bg-neutral-800"
                        >
                          Give up seat
                        </button>
                      </div>
                    )}

                    {done && (
                      <button
                        onClick={() => dismiss(v.reference)}
                        className="mt-3 rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {missing.length > 0 && (
          <button
            onClick={() => {
              missing.forEach(removePretripRef);
              void load();
            }}
            className="mt-6 text-xs text-neutral-500 underline"
          >
            Clear {missing.length} old request{missing.length > 1 ? "s" : ""} that no longer exist
          </button>
        )}
      </main>
    </div>
  );
}