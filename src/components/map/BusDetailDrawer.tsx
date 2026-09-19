"use client";

import { useEffect, useState } from "react";
import {
  Bus,
  X,
  Gauge,
  Users,
  MapPin,
  Clock,
  Route as RouteIcon,
  Crosshair,
} from "lucide-react";
import type { PublicBus } from "@/lib/passengerApi";

interface BusDetailDrawerProps {
  bus: PublicBus;
  onClose: () => void;
  /** Called when the user clicks "Center on map". */
  onCenter?: (bus: PublicBus) => void;
}

function timeSince(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function estimateEtaMinutes(bus: PublicBus): number | null {
  const speed = bus.live?.speed_kph ?? 0;
  if (speed < 5) return null;
  const assumedRemainingKm = 60;
  return Math.round((assumedRemainingKm / speed) * 60);
}

export function BusDetailDrawer({
  bus,
  onClose,
  onCenter,
}: BusDetailDrawerProps) {
  const [tick, setTick] = useState(0);

  // Update "Xs ago" every second
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Escape key closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const plate = bus.vehicle?.registration_plate ?? "Unknown";
  const origin = bus.route?.origin ?? "—";
  const destination = bus.route?.destination ?? "—";
  const routeName = bus.route?.name ?? "Unnamed route";
  const speed = Math.round(bus.live?.speed_kph ?? 0);
  const heading = Math.round(bus.live?.heading ?? 0);
  const passengers = bus.vehicle?.passenger_count ?? 0;
  const capacity = bus.vehicle?.capacity ?? null;
  const tripCode = bus.trip_code ?? bus.trip_id.slice(0, 8);
  const status = bus.status ?? "active";
  const lastSeen = timeSince(bus.live?.last_position_at);
  const eta = estimateEtaMinutes(bus);

  // Occupancy percent for the bar
  const occupancyPct =
    capacity && capacity > 0
      ? Math.min(100, Math.round((passengers / capacity) * 100))
      : 0;

  return (
    <aside
      aria-label="Bus details"
      className="flex h-full w-full flex-col overflow-y-auto border-l border-neutral-800 bg-neutral-950 lg:w-[380px]"
    >
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600/20 text-orange-500">
            <Bus className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs text-neutral-500">Live bus</div>
            <div className="text-sm font-semibold text-neutral-100">
              {plate}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
          aria-label="Close details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Route header */}
      <div className="flex-shrink-0 border-b border-neutral-800 px-4 py-4">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-500">
          <RouteIcon className="h-3 w-3" />
          ROUTE
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <span className="font-medium text-neutral-100">{origin}</span>
          <span className="text-neutral-600">→</span>
          <span className="font-medium text-neutral-100">{destination}</span>
        </div>
        <div className="mt-1 truncate text-xs text-neutral-500">
          {routeName}
        </div>
      </div>

      {/* Stats grid */}
      <div className="flex-shrink-0 grid grid-cols-2 gap-px bg-neutral-800">
        <Stat
          icon={<Gauge className="h-4 w-4" />}
          label="Speed"
          value={`${speed} km/h`}
        />
        <Stat
          icon={<Clock className="h-4 w-4" />}
          label="ETA"
          value={eta != null ? `~${eta} min` : "—"}
        />
        <Stat
          icon={<Users className="h-4 w-4" />}
          label="Passengers"
          value={capacity ? `${passengers} / ${capacity}` : `${passengers}`}
        />
        <Stat
          icon={<MapPin className="h-4 w-4" />}
          label="Heading"
          value={`${heading}°`}
        />
      </div>

      {/* Occupancy bar */}
      {capacity != null && capacity > 0 && (
        <div className="flex-shrink-0 border-b border-neutral-800 px-4 py-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium text-neutral-500">OCCUPANCY</span>
            <span className="text-neutral-400">{occupancyPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
            <div
              className={`h-full transition-all duration-500 ${
                occupancyPct > 90
                  ? "bg-red-500"
                  : occupancyPct > 70
                  ? "bg-amber-500"
                  : "bg-green-500"
              }`}
              style={{ width: `${occupancyPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Trip metadata */}
      <div className="flex-shrink-0 border-b border-neutral-800 px-4 py-4">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="mb-1 text-neutral-500">TRIP CODE</div>
            <div className="font-mono text-neutral-200">{tripCode}</div>
          </div>
          <div>
            <div className="mb-1 text-neutral-500">STATUS</div>
            <div className="uppercase text-neutral-200">{status}</div>
          </div>
          <div className="col-span-2">
            <div className="mb-1 text-neutral-500">LAST UPDATE</div>
            <div className="text-neutral-200">{lastSeen}</div>
          </div>
        </div>
      </div>

      {/* Coordinates (subtle) */}
      <div className="flex-shrink-0 px-4 py-4">
        <div className="mb-2 text-xs font-medium text-neutral-500">
          POSITION
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="mb-1 text-neutral-600">LAT</div>
            <div className="font-mono text-neutral-300">
              {bus.live?.latitude?.toFixed(5) ?? "—"}
            </div>
          </div>
          <div>
            <div className="mb-1 text-neutral-600">LNG</div>
            <div className="font-mono text-neutral-300">
              {bus.live?.longitude?.toFixed(5) ?? "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-auto flex-shrink-0 border-t border-neutral-800 p-4">
        {onCenter && (
          <button
            onClick={() => onCenter(bus)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-500"
          >
            <Crosshair className="h-4 w-4" />
            Center on map
          </button>
        )}
      </div>
    </aside>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 bg-neutral-950 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-neutral-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-sm font-semibold text-neutral-100">{value}</div>
    </div>
  );
}