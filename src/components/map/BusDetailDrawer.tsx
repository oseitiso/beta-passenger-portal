"use client";

import type { PublicBus } from "@/lib/passengerApi";
import { X } from "lucide-react";

function minutesSince(iso: string | null): number {
  if (!iso) return Infinity;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / 60000);
}

export function BusDetailDrawer({
  bus,
  onClose,
}: {
  bus: PublicBus | null;
  onClose: () => void;
}) {
  if (!bus) return null;

  const mins = minutesSince(bus.live.last_position_at);
  const fresh = mins <= 5;
  const stale = !fresh && mins < 30;
  const veryStale = mins >= 30;

  const statusColour = veryStale
    ? "text-neutral-500"
    : stale
    ? "text-amber-400"
    : "text-green-400";

  const statusLabel =
    mins === 0
      ? "Live"
      : mins === Infinity
      ? "No GPS"
      : mins < 60
      ? `${mins} min ago`
      : `${Math.floor(mins / 60)}h ago`;

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/70 z-[1090]"
        aria-hidden="true"
      />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-neutral-950 border-l border-neutral-800 z-[1100] overflow-y-auto">
        <div className="sticky top-0 bg-neutral-950 border-b border-neutral-800 z-10">
          <div className="p-6 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold">
                Bus
              </p>
              {bus.trip_code && (
                <p className="text-2xl font-mono font-bold text-[#FF6B00] mt-1 tracking-wider">
                  {bus.trip_code}
                </p>
              )}
              <p className="text-sm text-neutral-400 mt-1">
                {bus.route?.name ?? "—"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-neutral-500 hover:text-white"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {bus.route?.origin && bus.route?.destination && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
              <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold mb-2">
                Route
              </p>
              <p className="text-lg font-bold text-white">
                {bus.route.origin} → {bus.route.destination}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold mb-2">
                Speed
              </p>
              <p className="text-3xl font-bold text-white tabular-nums">
                {Math.round(bus.live.speed_kph ?? 0)}
              </p>
              <p className="text-xs text-neutral-500 mt-1">km/h</p>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
              <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold mb-2">
                On board
              </p>
              <p className="text-3xl font-bold text-white tabular-nums">
                {bus.vehicle.passenger_count}
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                {bus.vehicle.capacity
                  ? `of ${bus.vehicle.capacity} seats`
                  : "seats occupied"}
              </p>
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold">
                Location
              </p>
              <p className={`text-xs font-bold ${statusColour}`}>
                {fresh && (
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                )}
                {statusLabel}
              </p>
            </div>
            {bus.live.latitude != null && bus.live.longitude != null && (
              <p className="text-xs text-neutral-500 font-mono">
                {bus.live.latitude.toFixed(5)}, {bus.live.longitude.toFixed(5)}
              </p>
            )}
          </div>

          {bus.route?.stops && bus.route.stops.length > 0 && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
              <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-semibold mb-4">
                Stops on this route
              </p>
              <div className="space-y-3">
                {bus.route.stops.map((s, idx) => (
                  <div
                    key={s.stop_id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <div className="w-6 h-6 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-[10px] font-bold text-neutral-400 shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold truncate">
                        {s.name}
                      </p>
                      {s.city && s.city !== s.name && (
                        <p className="text-xs text-neutral-500 truncate">
                          {s.city}
                        </p>
                      )}
                    </div>
                    {s.distance_from_origin_km != null && (
                      <p className="text-xs text-neutral-600 tabular-nums shrink-0">
                        {s.distance_from_origin_km} km
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-neutral-900/50 border border-neutral-800/80 rounded-2xl p-4">
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Booking opens in Phase P3. For now you can only view live
              buses.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}