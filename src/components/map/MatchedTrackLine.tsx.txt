"use client";

import { Polyline } from "react-leaflet";

/** Recent road-snapped trace supplied by the shared server matcher. */
export function MatchedTrackLine({ positions }: { positions: [number, number][] }) {
  if (positions.length < 2) return null;
  return <Polyline positions={positions} pathOptions={{
    color: "#f97316", weight: 4, opacity: 0.82, lineCap: "round", lineJoin: "round",
  }} />;
}