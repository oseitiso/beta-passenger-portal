"use client";

import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { PublicStopShape } from "@/lib/routesApi";

interface StopMarkerProps {
  stop: PublicStopShape;
}

const createStopIcon = () =>
  L.divIcon({
    className: "",
    html: `
      <div style="
        width: 14px; height: 14px;
        background: #ffffff;
        border: 3px solid #1e293b;
        border-radius: 50%;
        box-shadow: 0 1px 4px rgba(0,0,0,0.4);
      "></div>
    `,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -8],
  });

export function StopMarker({ stop }: StopMarkerProps) {
  return (
    <Marker position={[stop.lat, stop.lng]} icon={createStopIcon()}>
      <Popup>
        <div style={{ minWidth: 140, fontFamily: "system-ui, sans-serif" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
            {stop.name}
          </div>
          {stop.city && (
            <div style={{ fontSize: 11, color: "#64748b" }}>
              {stop.city}
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  );
}