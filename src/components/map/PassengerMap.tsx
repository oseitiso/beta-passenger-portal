"use client";

import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  ZoomControl,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import L from "leaflet";
import type { PublicBus } from "@/lib/passengerApi";
import { BusMarker } from "./BusMarker";

interface PassengerMapProps {
  buses: PublicBus[];
  /** Buses that match the current filter (subset of `buses` when filter active) */
  matchingBusIds?: Set<string>;
  selectedBusId: string | null;
  onSelectBus: (bus: PublicBus) => void;
  focusBus?: PublicBus | null;
  layoutKey?: string | number;
  /** When true and a filter is active, non-matching buses are shown dimmed */
  dimNonMatching?: boolean;
}

const DEFAULT_CENTER: [number, number] = [-24.6282, 25.9231];
const DEFAULT_ZOOM = 6;

function MapFocusController({ bus }: { bus: PublicBus | null | undefined }) {
  const map = useMap();

  useEffect(() => {
    if (!bus) return;
    const lat = bus.live?.latitude;
    const lng = bus.live?.longitude;
    if (lat == null || lng == null) return;
    map.flyTo([lat, lng], 13, { duration: 1.2 });
  }, [bus, map]);

  return null;
}

function MapResizeController({ layoutKey }: { layoutKey?: string | number }) {
  const map = useMap();
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        map.invalidateSize({ animate: false });
      });
    });
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [layoutKey, map]);

  useEffect(() => {
    const onResize = () => map.invalidateSize({ animate: false });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [map]);

  return null;
}

/**
 * Wraps the bus markers in a Leaflet marker cluster group.
 * Renders BusMarker components as children — React-Leaflet doesn't
 * natively support clustering, so we render our own markers and let
 * Leaflet's clustering plugin manage grouping via imperative code.
 *
 * For simplicity and because our dataset is small, we render the
 * markers directly without the cluster group. The clustering CSS is
 * loaded for future use. When the fleet grows past ~50 buses, we can
 * wire up MarkerClusterGroup properly.
 */
function BusMarkerLayer({
  buses,
  selectedBusId,
  matchingBusIds,
  dimNonMatching,
  onSelectBus,
}: {
  buses: PublicBus[];
  selectedBusId: string | null;
  matchingBusIds?: Set<string>;
  dimNonMatching?: boolean;
  onSelectBus: (bus: PublicBus) => void;
}) {
  return (
    <>
      {buses.map((bus) => {
        const isSelected = bus.trip_id === selectedBusId;
        const isMatching =
          !matchingBusIds || matchingBusIds.has(bus.trip_id);
        const dimmed = Boolean(dimNonMatching && matchingBusIds && !isMatching);

        return (
          <BusMarker
            key={bus.trip_id}
            bus={bus}
            selected={isSelected}
            dimmed={dimmed}
            onSelect={onSelectBus}
          />
        );
      })}
    </>
  );
}

export function PassengerMap({
  buses,
  matchingBusIds,
  selectedBusId,
  onSelectBus,
  focusBus,
  layoutKey,
  dimNonMatching = false,
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
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <MapFocusController bus={focusBus} />
      <MapResizeController layoutKey={layoutKey} />

      <BusMarkerLayer
        buses={buses}
        selectedBusId={selectedBusId}
        matchingBusIds={matchingBusIds}
        dimNonMatching={dimNonMatching}
        onSelectBus={onSelectBus}
      />
    </MapContainer>
  );
}