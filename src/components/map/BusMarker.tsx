"use client";

import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { PublicBus } from "@/lib/passengerApi";

interface BusMarkerProps {
  bus: PublicBus;
  selected: boolean;
  onSelect: (bus: PublicBus) => void;
}

// Custom bus icon using inline SVG (orange B-ETA brand color)
const createBusIcon = (selected: boolean) =>
  L.divIcon({
    className: "",
    html: `
      <div style="
        width: 36px; height: 36px;
        background: ${selected ? "#f97316" : "#ea580c"};
        border: 2px solid ${selected ? "#fff" : "#f97316"};
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
        transform: ${selected ? "scale(1.15)" : "scale(1)"};
        transition: transform 0.2s;
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 6v6"></path><path d="M15 6v6"></path>
          <path d="M2 12h19.6"></path>
          <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"></path>
          <circle cx="7" cy="18" r="2"></circle>
          <circle cx="16" cy="18" r="2"></circle>
        </svg>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });

export function BusMarker({ bus, selected, onSelect }: BusMarkerProps) {
  // Skip rendering if no live position yet
  const lat = bus.live?.latitude;
  const lng = bus.live?.longitude;
  if (lat == null || lng == null) return null;

  const plate = bus.vehicle?.registration_plate ?? "Unknown";
  const origin = bus.route?.origin ?? "—";
  const destination = bus.route?.destination ?? "—";

  return (
    <Marker
      position={[lat, lng]}
      icon={createBusIcon(selected)}
      eventHandlers={{
        click: () => onSelect(bus),
      }}
    >
      <Popup>
        <div className="text-sm">
          <strong>{plate}</strong>
          <br />
          {origin} → {destination}
          <br />
          <span className="text-xs text-neutral-500">
            {bus.status ?? "active"}
          </span>
        </div>
      </Popup>
    </Marker>
  );
}