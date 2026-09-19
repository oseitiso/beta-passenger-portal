"use client";

import { Polyline } from "react-leaflet";
import type { PublicRouteShape } from "@/lib/routesApi";
import { colorForRoute } from "@/lib/routesApi";

interface RouteLineProps {
  route: PublicRouteShape;
  /** When true, dims the line (used with the map's filter mode) */
  dimmed?: boolean;
}

export function RouteLine({ route, dimmed = false }: RouteLineProps) {
  if (!route.polyline || route.polyline.length < 2) return null;

  // OSRM returns [lng, lat]; Leaflet wants [lat, lng]
  const positions: [number, number][] = route.polyline.map(([lng, lat]) => [
    lat,
    lng,
  ]);

  const color = colorForRoute(route.route_id);

  return (
    <Polyline
      positions={positions}
      pathOptions={{
        color,
        weight: dimmed ? 3 : 5,
        opacity: dimmed ? 0.25 : 0.75,
        lineCap: "round",
        lineJoin: "round",
      }}
    />
  );
}