"use client";

import { useEffect } from "react";
import { MapContainer as LeafletMap, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { PublicBus } from "@/lib/passengerApi";
import { BusMarker } from "./BusMarker";

const BOTSWANA_CENTER: [number, number] = [-22.3, 26.5];
const DEFAULT_ZOOM = 6;

function AutoFit({ buses }: { buses: PublicBus[] }) {
  const map = useMap();

  useEffect(() => {
    const valid = buses.filter(
      (b) =>
        b.live.latitude != null &&
        b.live.longitude != null
    );
    if (valid.length === 0) return;

    if (valid.length === 1) {
      map.setView(
        [valid[0].live.latitude!, valid[0].live.longitude!],
        10,
        { animate: true }
      );
    } else {
      const bounds = valid.map(
        (b) => [b.live.latitude!, b.live.longitude!] as [number, number]
      );
      map.fitBounds(bounds, { padding: [60, 60], animate: true });
    }
  }, [buses, map]);

  return null;
}

export function PassengerMap({
  buses,
  onBusClick,
}: {
  buses: PublicBus[];
  onBusClick: (bus: PublicBus) => void;
}) {
  return (
    <div className="rounded-2xl overflow-hidden border border-neutral-800 bg-neutral-900">
      <div style={{ height: "620px", width: "100%" }}>
        <LeafletMap
          center={BOTSWANA_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <AutoFit buses={buses} />
          {buses.map((b) => (
            <BusMarker
              key={b.trip_id}
              bus={b}
              onClick={() => onBusClick(b)}
            />
          ))}
        </LeafletMap>
      </div>
    </div>
  );
}