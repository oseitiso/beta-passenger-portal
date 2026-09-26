"use client";

import { useEffect, useState } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { PublicBus } from "@/lib/passengerApi";
import { reverseGeocode } from "@/lib/geo";

interface BusMarkerProps {
  bus: PublicBus;
  selected: boolean;
  dimmed?: boolean;
  onSelect: (bus: PublicBus) => void;
}

const createBusIcon = (selected: boolean, dimmed: boolean) => {
  const opacity = dimmed ? "0.35" : "1";
  const bg = dimmed ? "#525252" : selected ? "#f97316" : "#ea580c";
  const border = dimmed ? "#404040" : selected ? "#fff" : "#f97316";

  const pulseHtml = selected
    ? `
      <span style="
        position: absolute;
        inset: -6px;
        border-radius: 50%;
        background: #f97316;
        opacity: 0.5;
        animation: busPulse 1.5s ease-out infinite;
        pointer-events: none;
      "></span>
    `
    : "";

  return L.divIcon({
    className: "",
    html: `
      <div style="
        position: relative;
        width: 36px; height: 36px;
      ">
        ${pulseHtml}
        <div style="
          position: absolute;
          inset: 0;
          background: ${bg};
          border: 2px solid ${border};
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          transform: ${selected ? "scale(1.15)" : "scale(1)"};
          transition: transform 0.2s, opacity 0.2s;
          opacity: ${opacity};
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 6v6"></path><path d="M15 6v6"></path>
            <path d="M2 12h19.6"></path>
            <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"></path>
            <circle cx="7" cy="18" r="2"></circle>
            <circle cx="16" cy="18" r="2"></circle>
          </svg>
        </div>
      </div>
      <style>
        @keyframes busPulse {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      </style>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
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
  onSelect,
}: BusMarkerProps) {
  // ─── ALL HOOKS MUST BE AT THE TOP ───
  // React requires the same number of hooks on every render. Never call
  // hooks after a conditional return.

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

  // ─── END OF HOOKS ───
  // Everything below this line can include early returns safely.

  // Skip markers whose GPS is older than 2 minutes
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

  return (
    <Marker
      position={[lat, lng]}
      icon={createBusIcon(selected, dimmed)}
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