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
import type {
  PublicRouteShape,
  PublicStopShape,
} from "@/lib/routesApi";
import { BusMarker } from "./BusMarker";
import { RouteLine } from "./RouteLine";
import { StopMarker } from "./StopMarker";

interface PassengerMapProps {
  buses: PublicBus[];
  routes?: PublicRouteShape[];
  stops?: PublicStopShape[];
  matchingBusIds?: Set<string>;
  selectedBusId: string | null;
  onSelectBus: (bus: PublicBus) => void;
  focusBus?: PublicBus | null;
  layoutKey?: string | number;
  dimNonMatching?: boolean;
  /** Toggle visibility of route lines and stops */
  showRoutes?: boolean;
  showStops?: boolean;
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

export function PassengerMap({
  buses,
  routes = [],
  stops = [],
  matchingBusIds,
  selectedBusId,
  onSelectBus,
  focusBus,
  layoutKey,
  dimNonMatching = false,
  showRoutes = true,
  showStops = true,
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

      {/* Route lines (drawn first, so they sit under markers) */}
      {showRoutes &&
        routes.map((route) => (
          <RouteLine key={route.route_id} route={route} />
        ))}

      {/* Stop markers (small dots) */}
      {showStops &&
        stops.map((stop) => <StopMarker key={stop.id} stop={stop} />)}

      <MapFocusController bus={focusBus} />
      <MapResizeController layoutKey={layoutKey} />

      {/* Buses (on top of everything) */}
      {buses.map((bus) => {
        const isSelected = bus.trip_id === selectedBusId;
        const isMatching = !matchingBusIds || matchingBusIds.has(bus.trip_id);
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
    </MapContainer>
  );
}