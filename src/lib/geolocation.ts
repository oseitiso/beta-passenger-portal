"use client";

// Browser geolocation wrapper with promise-based API, timeouts, and clear error types.

export interface GeoCoords {
  lat: number;
  lng: number;
  accuracy: number; // meters
  timestamp: number;
}

export type GeoError =
  | { kind: "unsupported"; message: string }
  | { kind: "denied"; message: string }
  | { kind: "unavailable"; message: string }
  | { kind: "timeout"; message: string }
  | { kind: "unknown"; message: string };

export interface GetPositionOptions {
  /** Milliseconds before giving up. Default 10s. */
  timeoutMs?: number;
  /** If true, allow returning a cached position up to 60s old. Default true. */
  acceptCached?: boolean;
  /** Desired accuracy in meters. Default 100 (fast, street-level is fine). */
  accuracyMeters?: number;
}

/**
 * Get the user's current position once, with a clean promise API.
 * Never throws — returns either { coords } or { error }.
 */
export function getCurrentPosition(
  opts: GetPositionOptions = {}
): Promise<{ coords: GeoCoords } | { error: GeoError }> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const acceptCached = opts.acceptCached ?? true;
  const accuracyMeters = opts.accuracyMeters ?? 100;

  return new Promise((resolve) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      resolve({
        error: {
          kind: "unsupported",
          message: "This browser doesn't support location services.",
        },
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          coords: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          },
        });
      },
      (err) => {
        let geoErr: GeoError;
        switch (err.code) {
          case err.PERMISSION_DENIED:
            geoErr = {
              kind: "denied",
              message:
                "Location access denied. Enable it in your browser settings, or type your origin.",
            };
            break;
          case err.POSITION_UNAVAILABLE:
            geoErr = {
              kind: "unavailable",
              message:
                "Couldn't get your location. Check your GPS or network, or type your origin.",
            };
            break;
          case err.TIMEOUT:
            geoErr = {
              kind: "timeout",
              message: "Location took too long. Try again or type your origin.",
            };
            break;
          default:
            geoErr = {
              kind: "unknown",
              message: "Something went wrong getting your location.",
            };
        }
        resolve({ error: geoErr });
      },
      {
        enableHighAccuracy: false,
        timeout: timeoutMs,
        maximumAge: acceptCached ? 60_000 : 0,
      }
    );
  });
}

/**
 * Query the current permission state without prompting.
 * Returns "granted" | "denied" | "prompt" | "unknown".
 */
export async function getPermissionState(): Promise<
  "granted" | "denied" | "prompt" | "unknown"
> {
  if (typeof navigator === "undefined") return "unknown";

  // Modern Permissions API
  if (navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({
        name: "geolocation" as PermissionName,
      });
      return status.state as "granted" | "denied" | "prompt";
    } catch {
      // fall through
    }
  }
  return "unknown";
}