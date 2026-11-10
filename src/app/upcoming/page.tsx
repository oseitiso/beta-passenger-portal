"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, BellOff, Clock, MapPin, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import {
  fetchUpcomingStops,
  searchUpcomingTrips,
  nextFiveDays,
  formatTime,
  getAlertedTrips,
  setAlertedTrips,
  getLastSearch,
  setLastSearch,
  clearUpcomingCache,
  type UpcomingStop,
  type UpcomingTrip,
} from "@/lib/upcoming";
import { enableTripAlert, cancelTripAlert } from "@/lib/tripAlerts";
import { pushSupported, isIosNeedingInstall } from "@/lib/push";

const STATE_LABEL: Record<UpcomingTrip["state"], string> = {
  LIVE: "On the road now",
  ASSIGNED: "Bus assigned",
  TENTATIVE: "Scheduled",
};
const STATE_STYLE: Record<UpcomingTrip["state"], string> = {
  LIVE: "border border-green-900/50 bg-green-950/40 text-green-300",
  ASSIGNED: "border border-orange-900/50 bg-orange-950/40 text-orange-300",
  TENTATIVE: "border border-neutral-700 bg-neutral-800 text-neutral-300",
};

export default function UpcomingPage() {
  const days = useMemo(() => nextFiveDays(), []);
  const [stops, setStops] = useState<UpcomingStop[]>([]);
  const [stopsError, setStopsError] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(days[0].date);
  const [trips, setTrips] = useState<UpcomingTrip[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alerted, setAlerted] = useState<string[]>([]);
  const [busyTrip, setBusyTrip] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [canPush, setCanPush] = useState(true);
  const [iosInstall, setIosInstall] = useState(false);

  useEffect(() => {
    setAlerted(getAlertedTrips());
    setCanPush(pushSupported());
    setIosInstall(isIosNeedingInstall());
    fetchUpcomingStops()
      .then((s) => {
        setStops(s);
        const last = getLastSearch();
        if (last && s.some((x) => x.id === last.from) && s.some((x) => x.id === last.to)) {
          setFrom(last.from);
          setTo(last.to);
        }
      })
      .catch(() => setStopsError(true));
  }, []);

  const search = useCallback(async () => {
    if (!from || !to || from === to) {
      setTrips(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await searchUpcomingTrips(from, to, date);
      if (r.error) setError(r.error);
      setTrips(r.trips);
      setLastSearch(from, to);
    } catch {
      setError("Could not load trips. Check your connection and try again.");
      setTrips(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, date]);

  useEffect(() => {
    void search();
  }, [search]);

  async function toggleAlert(t: UpcomingTrip) {
    setNote(null);
    setBusyTrip(t.trip_id);
    const on = alerted.includes(t.trip_id);
    const r = on ? await cancelTripAlert(t.trip_id) : await enableTripAlert(t.trip_id, from, to);
    setBusyTrip(null);
    if (!r.ok) {
      setNote(r.error ?? "Something went wrong.");
      return;
    }
    const next = on ? alerted.filter((x) => x !== t.trip_id) : [...alerted, t.trip_id];
    setAlerted(next);
    setAlertedTrips(next);
  }

  const fromStops = stops.filter((s) => s.can_board);
  const toStops = stops.filter((s) => s.can_alight && s.id !== from);
  const fromName = stops.find((s) => s.id === from)?.name ?? "";
  const toName = stops.find((s) => s.id === to)?.name ?? "";

  const selectCls =
    "mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 focus:border-orange-500 focus:outline-none";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center pt-6 pb-20">
      <header className="w-full max-w-2xl px-4 mb-6 flex items-center justify-between">
        <Link href="/map" className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-100">
          <ArrowLeft className="h-4 w-4" />
          Back to map
        </Link>
        <div className="text-xs text-neutral-500">Upcoming trips</div>
      </header>

      <main className="w-full max-w-2xl px-4">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-3xl font-bold">Upcoming trips</h1>
          <button
            onClick={() => {
              clearUpcomingCache();
              void search();
            }}
            disabled={loading || !from || !to}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        <p className="mb-5 text-sm text-neutral-400">
          Scheduled buses for the next 5 days. Get an alert the moment a bus starts its trip, then request a seat on
          the map.
        </p>

        {stopsError && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>Could not load places. Check your connection and reload.</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-neutral-400">
            From
            <select
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                if (e.target.value === to) setTo("");
              }}
              className={selectCls}
            >
              <option value="">Choose</option>
              {fromStops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutral-400">
            To
            <select value={to} onChange={(e) => setTo(e.target.value)} className={selectCls}>
              <option value="">Choose</option>
              {toStops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => (
            <button
              key={d.date}
              onClick={() => setDate(d.date)}
              className={
                "shrink-0 rounded-full border px-3 py-1.5 text-sm " +
                (d.date === date
                  ? "border-orange-600 bg-orange-600 text-white"
                  : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800")
              }
            >
              {d.label}
            </button>
          ))}
        </div>

        {iosInstall && (
          <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-xs text-neutral-300">
            On iPhone, add B-ETA to your Home Screen first (Share, then Add to Home Screen) to receive alerts.
          </div>
        )}
        {!canPush && !iosInstall && (
          <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-xs text-neutral-300">
            Alerts are not available on this device or browser. You can still see the schedule.
          </div>
        )}
        {note && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{note}</span>
          </div>
        )}

        <div className="mt-5 space-y-4">
          {!from || !to ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-8 text-center">
              <MapPin className="mx-auto mb-3 h-10 w-10 text-neutral-600" />
              <div className="text-lg font-semibold">Where are you going?</div>
              <div className="mt-2 text-sm text-neutral-400">Choose where from and where to, then a day.</div>
            </div>
          ) : loading && !trips ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-900/40 bg-red-950/30 p-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : trips && trips.length === 0 ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-8 text-center">
              <Clock className="mx-auto mb-3 h-10 w-10 text-neutral-600" />
              <div className="text-lg font-semibold">No scheduled buses</div>
              <div className="mt-2 text-sm text-neutral-400">
                Nothing is planned for this day yet. Try another day, or check again later as operators add trips.
              </div>
            </div>
          ) : (
            trips?.map((t) => {
              const on = alerted.includes(t.trip_id);
              return (
                <div
                  key={t.trip_id}
                  className="relative w-full overflow-hidden rounded-2xl border border-neutral-700/60 bg-neutral-900 shadow-xl"
                >
                  <div className="flex items-center justify-between bg-gradient-to-r from-yellow-500 to-orange-500 px-4 py-1.5 text-black">
                    <h2 className="truncate text-[11px] font-black uppercase tracking-[0.2em]">
                      {t.operator ?? "Operator"}
                    </h2>
                    <span className="text-[10px] font-extrabold tracking-widest opacity-70">B-ETA</span>
                  </div>

                  <div className="px-4 pt-3 pb-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 text-xs text-neutral-400">{t.route}</div>
                      <span className={"flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] " + STATE_STYLE[t.state]}>
                        {STATE_LABEL[t.state]}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-semibold uppercase tracking-widest text-neutral-500">
                          {t.state === "LIVE" ? "Left" : "About"}
                        </div>
                        <div className="text-base font-bold leading-tight text-white">
                          {formatTime(t.state === "LIVE" ? t.departs_at : t.at_from)}
                        </div>
                        <div className="truncate text-xs text-neutral-400">{fromName}</div>
                      </div>
                      <div className="flex w-12 flex-shrink-0 items-center">
                        <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                        <span className="h-px flex-1 border-t border-dashed border-neutral-500" />
                        <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                      </div>
                      <div className="min-w-0 flex-1 text-right">
                        <div className="text-[9px] font-semibold uppercase tracking-widest text-neutral-500">Arrives about</div>
                        <div className="text-base font-bold leading-tight text-white">{formatTime(t.at_to)}</div>
                        <div className="truncate text-xs text-neutral-400">{toName}</div>
                      </div>
                    </div>

                    <div className="mt-2 text-[11px] text-neutral-500">
                      Times are estimates from the operator&apos;s schedule.
                    </div>

                    <div className="mt-3">
                      {t.state === "LIVE" ? (
                        <Link
                          href="/map"
                          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500"
                        >
                          <MapPin className="h-4 w-4" /> View on map
                        </Link>
                      ) : (
                        <button
                          onClick={() => toggleAlert(t)}
                          disabled={busyTrip === t.trip_id || !canPush || iosInstall}
                          className={
                            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 " +
                            (on
                              ? "border border-neutral-600 bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
                              : "bg-orange-600 text-white hover:bg-orange-500")
                          }
                        >
                          {busyTrip === t.trip_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : on ? (
                            <BellOff className="h-4 w-4" />
                          ) : (
                            <Bell className="h-4 w-4" />
                          )}
                          {on ? "Alert on - tap to turn off" : "Alert me when this trip starts"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
