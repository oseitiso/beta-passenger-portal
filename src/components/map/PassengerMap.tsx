"use client";

import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  ZoomControl,
  useMap,
  Polyline,
  CircleMarker,
  Tooltip,
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
import { MatchedTrackLine } from "./MatchedTrackLine";
import { StopMarker } from "./StopMarker";

export interface GroupedZone {
  name: string;
  lat: number;
  lng: number;
  isPassed: boolean;
}

interface PassengerMapProps {
  buses: PublicBus[];
  routes?: PublicRouteShape[];
  stops?: PublicStopShape[];
  matchingBusIds?: Set<string>;
  selectedBusId: string | null;
  onSelectBus: (bus: PublicBus) => void;
  focusBus?: PublicBus | null;
  focusVersion?: number;
  layoutKey?: string | number;
  dimNonMatching?: boolean;
  showRoutes?: boolean;
  showStops?: boolean;
  bookedTripId?: string | null;
  bookedState?: "accepted" | "picked_up" | null;
  groupedJourney?: GroupedZone[] | null;
}

const DEFAULT_CENTER: [number, number] = [-24.6282, 25.9231];
const DEFAULT_ZOOM = 6;

function MapFocusController({ bus, focusVersion }: { bus: PublicBus | null | undefined; focusVersion?: number }) {
  const map = useMap();
  const busRef = useRef(bus);

  useEffect(() => { busRef.current = bus; }, [bus]);

  useEffect(() => {
    const target = busRef.current;
    if (!target) return;
    const lat = target.map_position?.latitude ?? target.live?.latitude;
    const lng = target.map_position?.longitude ?? target.live?.longitude;
    if (lat == null || lng == null) return;
    map.flyTo([lat, lng], 13, { duration: 1.2 });
  }, [bus?.map_position?.latitude, bus?.map_position?.longitude, focusVersion, map]);

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

// A sub-component that fetches the road geometry for the given zones
// and renders the polyline + zone dots once ready.
function JourneyOverlay({ zones }: { zones: GroupedZone[] }) {
  const [coordinates, setCoordinates] = useState<[number, number][] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (zones.length < 2) {
      setCoordinates(null);
      return;
    }

    setLoading(true);
    const stopsParam = zones.map((z) => `${z.lat},${z.lng}`).join(";");

    fetch(`/api/route-geometry?stops=${encodeURIComponent(stopsParam)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && Array.isArray(data.coordinates) && data.coordinates.length > 0) {
          setCoordinates(data.coordinates);
        } else {
          // Fallback: draw straight lines
          setCoordinates(zones.map((z) => [z.lat, z.lng]));
        }
      })
      .catch(() => {
        // Fallback: draw straight lines
        setCoordinates(zones.map((z) => [z.lat, z.lng]));
      })
      .finally(() => setLoading(false));
  }, [zones]);

  // Show the straight-line placeholder while loading so the map isn't empty
  const drawnLine = coordinates ?? zones.map((z) => [z.lat, z.lng]);

  return (
    <>
      <Polyline
        positions={drawnLine}
        color="#f97316"
        weight={4}
        opacity={loading ? 0.5 : 0.85}
      />
      {zones.map((zone, idx) => (
        <CircleMarker
          key={`zone-${idx}`}
          center={[zone.lat, zone.lng]}
          radius={zone.isPassed ? 6 : 9}
          pathOptions={{
            fillColor: zone.isPassed ? "#4b5563" : "#f97316",
            fillOpacity: 1,
            color: "#0A0A0A",
            weight: 2,
          }}
        >
          <Tooltip direction="top" offset={[0, -12]} opacity={1}>
            <div className="text-xs font-bold text-neutral-900">
              {zone.name}
              {zone.isPassed && (
                <span className="ml-1 text-[10px] text-neutral-500">(passed)</span>
              )}
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

export function PassengerMap({
  buses,
  routes = [],
  stops = [],
  matchingBusIds,
  selectedBusId,
  onSelectBus,
  focusBus,
  focusVersion,
  layoutKey,
  dimNonMatching = false,
  showRoutes = true,
  showStops = true,
  bookedTripId = null,
  bookedState = null,
  groupedJourney = null,
}: PassengerMapProps) {
  const visibleBuses = bookedTripId
    ? buses.filter((b) => b.trip_id === bookedTripId)
    : buses;

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

      {groupedJourney && groupedJourney.length > 1 && (
        <JourneyOverlay zones={groupedJourney} />
      )}

      {showRoutes &&
        routes.map((route) => (
          <RouteLine key={route.route_id} route={route} />
        ))}

      {showStops &&
        stops.map((stop) => <StopMarker key={stop.id} stop={stop} />)}

      {visibleBuses.map((bus) => bus.matched_track?.paths?.map((path, index) => (
        <MatchedTrackLine key={`${bus.trip_id}-${index}`} positions={path} />
      )))}

      <MapFocusController bus={focusBus} focusVersion={focusVersion} />
      <MapResizeController layoutKey={layoutKey} />

      {visibleBuses.map((bus) => {
        const isSelected = bus.trip_id === selectedBusId;
        const isMatching = !matchingBusIds || matchingBusIds.has(bus.trip_id);
        const dimmed = Boolean(dimNonMatching && matchingBusIds && !isMatching);

        const markerBookingState =
          bookedTripId && bus.trip_id === bookedTripId ? bookedState : null;

        return (
          <BusMarker
            key={bus.trip_id}
            bus={bus}
            selected={isSelected}
            dimmed={dimmed}
            bookingState={markerBookingState}
            onSelect={onSelectBus}
          />
        );
      })}
    </MapContainer>
  );
}