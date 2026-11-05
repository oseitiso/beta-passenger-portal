"use client";

import { useEffect, useState } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { PublicBus } from "@/lib/passengerApi";
import { reverseGeocode } from "@/lib/geo";

export type BookingMarkerState = "accepted" | "picked_up" | null;

interface BusMarkerProps {
  bus: PublicBus;
  selected: boolean;
  dimmed?: boolean;
  bookingState?: BookingMarkerState;
  onSelect: (bus: PublicBus) => void;
}

const createBusIcon = (
  selected: boolean,
  dimmed: boolean,
  bookingState: BookingMarkerState = null,
  heading: number = 0
) => {
  // Booking state wins over selection colour so the passenger can always
  // find their own bus. The bus artwork keeps its own colours; the state is
  // shown by a coloured glow around the bus and a pulse behind it.
  let glow: string | null = null;

  if (bookingState === "picked_up") glow = "#3b82f6";
  else if (bookingState === "accepted") glow = "#22c55e";
  else if (selected) glow = "#f97316";

  const opacity = dimmed ? "0.35" : "1";
  const filter = dimmed
    ? "grayscale(1) drop-shadow(0 1px 2px rgba(0,0,0,0.5))"
    : glow
    ? `drop-shadow(0 0 2px ${glow}) drop-shadow(0 0 4px ${glow}) drop-shadow(0 2px 3px rgba(0,0,0,0.5))`
    : "drop-shadow(0 2px 3px rgba(0,0,0,0.55))";

  const pulseHtml = glow && !dimmed
    ? `
      <span style="
        position: absolute;
        left: 50%; top: 50%;
        width: 34px; height: 34px;
        margin: -17px 0 0 -17px;
        border-radius: 50%;
        background: ${glow};
        opacity: 0.5;
        animation: busPulse 1.5s ease-out infinite;
        pointer-events: none;
      "></span>
    `
    : "";

  return L.divIcon({
    className: "",
    html: `
      <div style="position: relative; width: 40px; height: 40px;">
        ${pulseHtml}
        <div style="
          position: absolute;
          inset: 0;
          display: flex; align-items: center; justify-content: center;
          transform: ${selected ? "scale(1.15)" : "scale(1)"};
          transition: transform 0.2s, opacity 0.2s;
          opacity: ${opacity};
        ">
          <div style="
            transform: rotate(${heading}deg);
            transition: transform 0.4s ease-out;
            display: flex; align-items: center; justify-content: center;
          ">
            <img
              src="/bus-marker.svg"
              alt=""
              draggable="false"
              style="height: 48px; width: auto; display: block; pointer-events: none; filter: ${filter};"
            />
          </div>
        </div>
      </div>
      <style>
        @keyframes busPulse {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(2); opacity: 0; }
        }
      </style>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -26],
  });
};

function timeSince(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function formatArrivalClock(
  etaMinutes: number | null | undefined
): string | null {
  if (etaMinutes == null || etaMinutes <= 0) return null;
  const arrival = new Date(Date.now() + etaMinutes * 60_000);
  return arrival.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatEtaHuman(etaMinutes: number | null | undefined): string | null {
  if (etaMinutes == null || etaMinutes <= 0) return null;
  if (etaMinutes < 60) return `${Math.round(etaMinutes)} min`;
  const h = Math.floor(etaMinutes / 60);
  const m = Math.round(etaMinutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function BusMarker({
  bus,
  selected,
  dimmed = false,
  bookingState = null,
  onSelect,
}: BusMarkerProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const lat = bus.live?.latitude ?? null;
  const lng = bus.live?.longitude ?? null;

  const [placeName, setPlaceName] = useState<string | null>(null);
  useEffect(() => {
    if (lat == null || lng == null) {
      setPlaceName(null);
      return;
    }
    let cancelled = false;
    reverseGeocode(lat, lng).then((result) => {
      if (cancelled) return;
      setPlaceName(result?.short ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  const MAX_AGE_MS = 5 * 60 * 1000;
  const lastPos = bus.live?.last_position_at;
  if (lastPos) {
    const age = Date.now() - new Date(lastPos).getTime();
    if (isNaN(age) || age > MAX_AGE_MS) return null;
  }

  if (lat == null || lng == null) return null;

  const plate = bus.vehicle?.registration_plate ?? "Unknown";
  const origin = bus.route?.origin ?? "—";
  const destination = bus.route?.destination ?? "—";
  const speed = Math.round(bus.live?.speed_kph ?? 0);
  const passengers = bus.vehicle?.passenger_count ?? 0;
  const capacity = bus.vehicle?.capacity ?? null;
  const remainingKm = bus.live?.distance_remaining_km ?? null;
  const etaMin = bus.live?.eta_minutes ?? null;
  const etaHuman = formatEtaHuman(etaMin);
  const etaClock = formatArrivalClock(etaMin);
  const lastSeen = timeSince(bus.live?.last_position_at);

  // Use heading if available, otherwise 0 (North)
  const heading = bus.live?.heading ?? 0;

  return (
    <Marker
      position={[lat, lng]}
      icon={createBusIcon(selected, dimmed, bookingState, heading)}
      eventHandlers={{
        click: () => onSelect(bus),
      }}
    >
      <Popup>
        <div style={{ minWidth: 220, fontFamily: "system-ui, sans-serif" }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
            {plate}
          </div>
          <div
            style={{
              color: "#ea580c",
              fontWeight: 600,
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            {origin} → {destination}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
              marginBottom: 8,
              fontSize: 12,
              color: "#333",
            }}
          >
            <span style={{ color: "#ea580c", flexShrink: 0 }}>📍</span>
            <span style={{ fontWeight: 500 }}>
              {placeName ?? "Location unavailable"}
            </span>
          </div>

          {etaHuman && (
            <div
              style={{
                background: "#fff7ed",
                border: "1px solid #fed7aa",
                borderRadius: 6,
                padding: "6px 8px",
                marginBottom: 8,
              }}
            >
              <div style={{ color: "#9a3412", fontSize: 10, fontWeight: 600 }}>
                ARRIVES IN
              </div>
              <div
                style={{
                  color: "#ea580c",
                  fontSize: 15,
                  fontWeight: 700,
                  lineHeight: 1.2,
                }}
              >
                {etaHuman}
                {etaClock && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#c2410c",
                      marginLeft: 6,
                    }}
                  >
                    · {etaClock}
                  </span>
                )}
              </div>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              fontSize: 12,
              color: "#333",
              marginBottom: 6,
            }}
          >
            <div>
              <div style={{ color: "#888", fontSize: 10 }}>SPEED</div>
              <div style={{ fontWeight: 600 }}>{speed} km/h</div>
            </div>
            <div>
              <div style={{ color: "#888", fontSize: 10 }}>REMAINING</div>
              <div style={{ fontWeight: 600 }}>
                {remainingKm != null ? `${remainingKm.toFixed(0)} km` : "—"}
              </div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ color: "#888", fontSize: 10 }}>PASSENGERS</div>
              <div style={{ fontWeight: 600 }}>
                {passengers}
                {capacity ? ` / ${capacity}` : ""}
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: 10,
              color: "#888",
              borderTop: "1px solid #eee",
              paddingTop: 4,
            }}
          >
            Last update: {lastSeen} · {bus.status ?? "active"}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}