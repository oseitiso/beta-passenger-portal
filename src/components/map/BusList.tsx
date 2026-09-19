"use client";

import { Bus, Gauge, Users } from "lucide-react";
import type { PublicBus } from "@/lib/passengerApi";

interface BusListProps {
  buses: PublicBus[];
  selectedBusId: string | null;
  onSelectBus: (bus: PublicBus) => void;
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

export function BusList({
  buses,
  selectedBusId,
  onSelectBus,
  loading,
}: BusListProps) {
  // Sort alphabetically by registration plate for predictable order
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

          return (
            <li key={bus.trip_id}>
              <button
                onClick={() => onSelectBus(bus)}
                className={`w-full px-4 py-3 text-left transition-colors ${
                  isSelected
                    ? "bg-orange-600/10 border-l-2 border-orange-600"
                    : "hover:bg-neutral-900 border-l-2 border-transparent"
                }`}
              >
                {/* Row 1 — plate + speed + freshness */}
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-orange-600/20 text-orange-500">
                    <Bus className="h-3.5 w-3.5" />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-100">
                    {plate}
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-1 text-xs text-neutral-400">
                    <Gauge className="h-3 w-3" />
                    {speed}
                  </span>
                  <span className="flex-shrink-0 text-[10px] text-neutral-500">
                    {lastSeen}
                  </span>
                </div>

                {/* Row 2 — route */}
                <div className="mt-1.5 truncate text-xs text-neutral-300">
                  {origin} <span className="text-neutral-600">→</span>{" "}
                  {destination}
                </div>

                {/* Row 3 — passengers + trip code */}
                <div className="mt-1.5 flex items-center gap-3 text-xs text-neutral-500">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {passengers}
                    {capacity ? `/${capacity}` : ""}
                  </span>
                  <span className="truncate font-mono text-[10px] tracking-tight">
                    {tripCode}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}