"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
  Polyline,
  CircleMarker,
  Marker,
  Tooltip,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import L from "leaflet";
import type { PublicBus, PublicStop } from "@/lib/passengerApi";
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
  bookedRouteStops?: PublicStop[] | null;
  boardingStopName?: string | null;
  alightingStopName?: string | null;
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

function ZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
  });
  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);
  return null;
}

/**
 * Split the drawn route at the bus: the part already driven ("behind") and the
 * part still to come ("ahead"). If the bus is not close to the line (GPS off
 * route, or position unknown) nothing is split and the whole line stays "ahead".
 */
function splitAtBus(
  line: [number, number][],
  bus: [number, number] | null
): { behind: [number, number][]; ahead: [number, number][] } {
  if (!bus || line.length < 2) return { behind: [], ahead: line };

  const cosLat = Math.cos((bus[0] * Math.PI) / 180);
  const px = bus[1] * cosLat;
  const py = bus[0];

  let bestD = Infinity;
  let bestI = 0;
  let bestP: [number, number] = line[0];

  for (let i = 0; i < line.length - 1; i++) {
    const [aLat, aLng] = line[i];
    const [bLat, bLng] = line[i + 1];
    const ax = aLng * cosLat;
    const ay = aLat;
    const dx = bLng * cosLat - ax;
    const dy = bLat - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = (px - cx) * (px - cx) + (py - cy) * (py - cy);
    if (d < bestD) {
      bestD = d;
      bestI = i;
      bestP = [aLat + t * (bLat - aLat), aLng + t * (bLng - aLng)];
    }
  }

  // ~0.03 degrees is roughly 3 km: further than that, do not split.
  if (Math.sqrt(bestD) > 0.03) return { behind: [], ahead: line };

  return {
    behind: [...line.slice(0, bestI + 1), bestP],
    ahead: [bestP, ...line.slice(bestI + 1)],
  };
}

function JourneyOverlay({
  zones,
  stops,
  currentZoom,
  busPos,
}: {
  zones: GroupedZone[];
  stops: PublicStop[] | null;
  currentZoom: number;
  busPos: [number, number] | null;
}) {
  const [coordinates, setCoordinates] = useState<[number, number][] | null>(null);
  const [loading, setLoading] = useState(false);

  // Real route stops, in order. The line is routed through ALL of them so it
  // follows the actual route and ends at the final stop.
  const routeStops = useMemo(() => {
    if (!stops) return [] as PublicStop[];
    return stops
      .filter((s) => s.lat != null && s.lng != null)
      .sort((a, b) => a.order - b.order);
  }, [stops]);

  const waypoints = useMemo<[number, number][]>(() => {
    if (routeStops.length >= 2) return routeStops.map((s) => [s.lat as number, s.lng as number]);
    return zones.map((z) => [z.lat, z.lng]);
  }, [routeStops, zones]);

  // Zone dots are averaged positions that can sit off the road. Snap each one
  // to its nearest real stop so it lies on the line.
  const zoneDots = useMemo(
    () =>
      zones.map((z) => {
        if (routeStops.length === 0) return z;
        let best = routeStops[0];
        let bestD = Infinity;
        for (const s of routeStops) {
          const d = Math.pow((s.lat as number) - z.lat, 2) + Math.pow((s.lng as number) - z.lng, 2);
          if (d < bestD) {
            bestD = d;
            best = s;
          }
        }
        return { ...z, lat: best.lat as number, lng: best.lng as number };
      }),
    [zones, routeStops]
  );

  // Show a destination dot when no zone dot already sits on the final stop.
  const lastStop = routeStops.length > 0 ? routeStops[routeStops.length - 1] : null;
  const showEndDot =
    lastStop != null &&
    !zoneDots.some(
      (z) =>
        Math.abs(z.lat - (lastStop.lat as number)) < 0.0005 &&
        Math.abs(z.lng - (lastStop.lng as number)) < 0.0005
    );

  const waypointKey = waypoints.map((p) => `${p[0]},${p[1]}`).join(";");
  const waypointsRef = useRef(waypoints);
  waypointsRef.current = waypoints;

  useEffect(() => {
    if (waypointsRef.current.length < 2) {
      setCoordinates(null);
      return undefined;
    }

    // The road geometry for a given set of stops never changes, so keep it on
    // the phone. After the first visit the line appears instantly, with no
    // network request (a big help on slow data).
    const cacheKey = `b-eta-route-geom-v1:${waypointKey}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 1) {
          setCoordinates(parsed);
          return undefined;
        }
      }
    } catch {
      // Storage unavailable or corrupted: just fetch normally.
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/route-geometry?stops=${encodeURIComponent(waypointKey)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data && Array.isArray(data.coordinates) && data.coordinates.length > 0) {
          setCoordinates(data.coordinates);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(data.coordinates));
          } catch {
            // Storage full or blocked: not critical.
          }
        } else {
          setCoordinates(waypointsRef.current);
        }
      })
      .catch(() => {
        if (!cancelled) setCoordinates(waypointsRef.current);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [waypointKey]);

  const drawnLine = coordinates ?? waypoints;

  const busLat = busPos ? busPos[0] : null;
  const busLng = busPos ? busPos[1] : null;
  const { behind, ahead } = useMemo(
    () => splitAtBus(drawnLine, busLat != null && busLng != null ? [busLat, busLng] : null),
    [drawnLine, busLat, busLng]
  );
  const showIndividualStops = currentZoom >= 12 && stops && stops.length > 0;

  return (
    <>
      {behind.length > 1 && (
        <Polyline
          positions={behind}
          color="#6b7280"
          weight={5}
          opacity={0.9}
          dashArray="8 10"
        />
      )}
      <Polyline positions={ahead} color="#f97316" weight={6} opacity={loading ? 0.5 : 0.95} />
      
      {showIndividualStops ? (
        stops!.map((stop, idx) => {
          if (stop.lat == null || stop.lng == null) return null;
          return (
            <CircleMarker
              key={`stop-${idx}`}
              center={[stop.lat, stop.lng]}
              radius={stop.unboardable_reason === "bus_passed" ? 4 : 6}
              pathOptions={{
                fillColor: stop.unboardable_reason === "bus_passed" ? "#4b5563" : "#f97316",
                fillOpacity: 1,
                color: "#0A0A0A",
                weight: 2,
              }}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                <div className="text-xs font-bold text-neutral-900">{stop.name}</div>
              </Tooltip>
            </CircleMarker>
          );
        })
      ) : (
        zoneDots.map((zone, idx) => (
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
                {zone.isPassed && <span className="ml-1 text-[10px] text-neutral-500">(passed)</span>}
              </div>
            </Tooltip>
          </CircleMarker>
        ))
      )}

      {!showIndividualStops && showEndDot && lastStop && (
        <CircleMarker
          center={[lastStop.lat as number, lastStop.lng as number]}
          radius={6}
          pathOptions={{ fillColor: "#f97316", fillOpacity: 1, color: "#0A0A0A", weight: 2 }}
        >
          <Tooltip direction="top" offset={[0, -10]} opacity={1}>
            <div className="text-xs font-bold text-neutral-900">{lastStop.name}</div>
          </Tooltip>
        </CircleMarker>
      )}
    </>
  );
}

/**
 * A stop highlighted for the passenger's booking. Same colours as the bus
 * marker: green once the driver accepted, blue once the passenger is on board.
 * `pulsing` adds the animated ring.
 */
function PulseStopMarker({
  position,
  dotColour,
  pulseColour,
  pulsing,
  label,
}: {
  position: [number, number];
  dotColour: string;
  pulseColour: string;
  pulsing: boolean;
  label: string;
}) {
  // Memoised so the CSS animation is not restarted on every map re-render.
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: `
          <div style="position:relative;width:28px;height:28px;">
            ${
              pulsing
                ? `<span style="position:absolute;inset:0;border-radius:50%;background:${pulseColour};opacity:0.55;animation:stopPulse 1.6s ease-out infinite;pointer-events:none;"></span>`
                : ""
            }
            <span style="position:absolute;left:7px;top:7px;width:14px;height:14px;box-sizing:border-box;border-radius:50%;background:${dotColour};border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.5);"></span>
          </div>
          <style>
            @keyframes stopPulse {
              0% { transform: scale(0.5); opacity: 0.6; }
              100% { transform: scale(1.9); opacity: 0; }
            }
          </style>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    [dotColour, pulseColour, pulsing]
  );

  return (
    <Marker position={position} icon={icon} zIndexOffset={900}>
      <Tooltip direction="top" offset={[0, -12]} opacity={1}>
        <div className="text-xs font-bold text-neutral-900">{label}</div>
      </Tooltip>
    </Marker>
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
  bookedRouteStops = null,
  boardingStopName = null,
  alightingStopName = null,
}: PassengerMapProps) {
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);

  const visibleBuses = bookedTripId
    ? buses.filter((b) => b.trip_id === bookedTripId)
    : buses;

  // Stops to highlight for the passenger's own booking (matched by name, the
  // same way the arrival alert does). Nothing is highlighted without a live booking.
  const findBookedStop = (name: string | null) =>
    bookedState && name && bookedRouteStops
      ? bookedRouteStops.find((s) => s.name === name && s.lat != null && s.lng != null) ?? null
      : null;
  const boardingStop = findBookedStop(boardingStopName);
  const alightingStop = findBookedStop(alightingStopName);
  const stopColours =
    bookedState === "picked_up"
      ? { dot: "#3b82f6", pulse: "#60a5fa" }
      : { dot: "#22c55e", pulse: "#4ade80" };

  const bookedBus = bookedTripId ? buses.find((b) => b.trip_id === bookedTripId) : null;
  const bkLat = bookedBus?.map_position?.latitude ?? bookedBus?.live?.latitude;
  const bkLng = bookedBus?.map_position?.longitude ?? bookedBus?.live?.longitude;
  const bookedBusPos: [number, number] | null =
    bkLat != null && bkLng != null ? [bkLat, bkLng] : null;

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

      <ZoomTracker onZoomChange={setCurrentZoom} />

      {groupedJourney && groupedJourney.length > 1 && (
        <JourneyOverlay
          zones={groupedJourney}
          stops={bookedRouteStops}
          currentZoom={currentZoom}
          busPos={bookedBusPos}
        />
      )}

      {boardingStop && (
        <PulseStopMarker
          position={[boardingStop.lat as number, boardingStop.lng as number]}
          dotColour={stopColours.dot}
          pulseColour={stopColours.pulse}
          pulsing={bookedState === "accepted"}
          label={`Boarding: ${boardingStop.name}`}
        />
      )}
      {alightingStop && (
        <PulseStopMarker
          position={[alightingStop.lat as number, alightingStop.lng as number]}
          dotColour={stopColours.dot}
          pulseColour={stopColours.pulse}
          pulsing
          label={`Drop-off: ${alightingStop.name}`}
        />
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