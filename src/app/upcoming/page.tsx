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
import { fetchMyPretripTrips, type MyPretripTrip } from "@/lib/pretrip";
import { PlaceSearch } from "@/components/PlaceSearch";
import { enableTripAlert, cancelTripAlert } from "@/lib/tripAlerts";
import { pushSupported, isIosNeedingInstall } from "@/lib/push";

const STATE_LABEL: Record<UpcomingTrip["state"], string> = {
  LIVE: "On the road now",
  ASSIGNED: "Bus assigned",
  TENTATIVE: "Scheduled",
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
  const [mine, setMine] = useState<Record<string, MyPretripTrip>>({});
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

  useEffect(() => {
    void fetchMyPretripTrips().then(setMine);
  }, [trips]);

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
        <Link href="/pretrip" className="text-xs text-orange-400 hover:text-orange-300">My seats</Link>
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

        <div className="space-y-2">
          <PlaceSearch
            label="From"
            stops={fromStops}
            value={from}
            placeholder="Type a town or stop"
            onChange={(id) => {
              setFrom(id);
              if (id === to) setTo("");
            }}
          />
          <PlaceSearch label="To" stops={toStops} value={to} placeholder="Type a town or stop" onChange={setTo} />
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

        {trips && trips.some((x) => !x.from_time_known || !x.to_time_known) && (
          <div className="mt-3 text-[11px] text-neutral-500">
            Times come from the operator&apos;s schedule. Where an operator has not set a time for a stop, the departure
            time of the first stop is shown, or the time is marked not set.
          </div>
        )}

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

        <div className="mt-4 space-y-2.5">
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
              const btn =
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50";
              return (
                <div
                  key={t.trip_id}
                  className="w-full overflow-hidden rounded-xl border border-neutral-700/60 bg-neutral-900 shadow-lg"
                >
                  <div className="flex items-center justify-between bg-gradient-to-r from-yellow-500 to-orange-500 px-3 py-1 text-black">
                    <h2 className="truncate text-[10px] font-black uppercase tracking-[0.18em]">
                      {t.operator ?? "Operator"}
                    </h2>
                    <span className="flex-shrink-0 text-[10px] font-bold opacity-75">{STATE_LABEL[t.state]}</span>
                  </div>

                  <div className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-lg font-bold leading-tight text-white">
                          {formatTime(t.state === "LIVE" || !t.from_time_known ? t.departs_at : t.at_from)}
                          {t.state !== "LIVE" && t.from_time_known && (
                            <span className="ml-1 text-[10px] font-normal text-neutral-500">about</span>
                          )}
                        </div>
                        <div className="truncate text-[11px] text-neutral-400">
                          {t.state === "LIVE" || !t.from_time_known ? t.origin ?? "" : fromName}
                        </div>
                      </div>
                      <div className="flex w-10 flex-shrink-0 items-center">
                        <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                        <span className="h-px flex-1 border-t border-dashed border-neutral-500" />
                        <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                      </div>
                      <div className="min-w-0 flex-1 text-right">
                        <div
                          className={
                            "leading-tight " + (t.to_time_known ? "text-lg font-bold text-white" : "text-sm text-neutral-500")
                          }
                        >
                          {t.to_time_known ? formatTime(t.at_to) : "Time not set"}
                        </div>
                        <div className="truncate text-[11px] text-neutral-400">{toName}</div>
                      </div>
                    </div>

                    <div className="mt-0.5 truncate text-[11px] text-neutral-500">{t.route}</div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {mine[t.trip_id] ? (
                        <Link
                          href="/pretrip"
                          className={btn + " border border-green-900/60 bg-green-950/40 text-green-300 hover:bg-green-950/70"}
                        >
                          {mine[t.trip_id].seat_numbers.length > 1 ? "Seats " : "Seat "}
                          {mine[t.trip_id].seat_numbers.join(" + ")}{" "}
                          {mine[t.trip_id].state === "BOARDED" ? "boarded" : "requested"}
                        </Link>
                      ) : t.can_pretrip && (
                        <Link
                          href={
                            "/pretrip/new?" +
                            new URLSearchParams({
                              trip: t.trip_id,
                              to,
                              o: t.operator ?? "",
                              r: t.route ?? "",
                              t: t.departs_at,
                              tn: toName,
                              fn: fromName,
                            }).toString()
                          }
                          className={btn + " bg-orange-600 text-white hover:bg-orange-500"}
                        >
                          Request a seat
                          {typeof t.pretrip_seats_free === "number" ? " - " + t.pretrip_seats_free + " free" : ""}
                        </Link>
                      )}
                      {t.state === "LIVE" ? (
                        <Link href="/map" className={btn + " bg-orange-600 text-white hover:bg-orange-500"}>
                          <MapPin className="h-3.5 w-3.5" /> View on map
                        </Link>
                      ) : (
                        <button
                          onClick={() => toggleAlert(t)}
                          disabled={busyTrip === t.trip_id || !canPush || iosInstall}
                          className={
                            btn +
                            " " +
                            (on
                              ? "border border-neutral-600 bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
                              : t.can_pretrip
                              ? "border border-neutral-600 text-neutral-200 hover:bg-neutral-800"
                              : "bg-orange-600 text-white hover:bg-orange-500")
                          }
                        >
                          {busyTrip === t.trip_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : on ? (
                            <BellOff className="h-3.5 w-3.5" />
                          ) : (
                            <Bell className="h-3.5 w-3.5" />
                          )}
                          {on ? "Alert on" : "Alert me when it starts"}
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