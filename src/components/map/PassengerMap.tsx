"use client";

import { MapContainer, TileLayer, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { PublicBus } from "@/lib/passengerApi";
import { BusMarker } from "./BusMarker";

interface PassengerMapProps {
  buses: PublicBus[];
  selectedBusId: string | null;
  onSelectBus: (bus: PublicBus) => void;
}

// Gaborone, Botswana — center of operations
const DEFAULT_CENTER: [number, number] = [-24.6282, 25.9231];
const DEFAULT_ZOOM = 12;

export function PassengerMap({
  buses,
  selectedBusId,
  onSelectBus,
}: PassengerMapProps) {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      zoomControl={false}
      style={{ height: "100%", width: "100%", background: "#0a0a0a" }}
      className="rounded-lg"
    >
      <ZoomControl position="bottomright" />
      {/* OpenStreetMap — free, no API key required */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {buses.map((bus) => (
        <BusMarker
          key={bus.trip_id}
          bus={bus}
          selected={bus.trip_id === selectedBusId}
          onSelect={onSelectBus}
        />
      ))}
    </MapContainer>
  );
}