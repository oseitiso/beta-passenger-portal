"use client";

import { Marker } from "react-leaflet";
import { divIcon } from "leaflet";
import type { PublicBus } from "@/lib/passengerApi";

function minutesSince(iso: string | null): number {
  if (!iso) return Infinity;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / 60000);
}

function busIcon(stale: boolean, veryStale: boolean) {
  const colour = veryStale
    ? "bg-neutral-600"
    : stale
    ? "bg-amber-500"
    : "bg-green-500";

  return divIcon({
    html: `
      <div style="
        width: 34px; height: 34px;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        border: 2px solid white;
        font-weight: 900; font-size: 11px;
        font-family: system-ui, sans-serif;
        color: white;
      " class="${colour}">🚌</div>
    `,
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export function BusMarker({
  bus,
  onClick,
}: {
  bus: PublicBus;
  onClick: () => void;
}) {
  if (bus.live.latitude == null || bus.live.longitude == null) return null;

  const stale = minutesSince(bus.live.last_position_at) > 5;
  const veryStale = minutesSince(bus.live.last_position_at) > 30;

  return (
    <Marker
      position={[bus.live.latitude, bus.live.longitude]}
      icon={busIcon(stale, veryStale)}
      eventHandlers={{ click: onClick }}
    />
  );
}