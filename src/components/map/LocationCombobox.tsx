"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { MapPin, X, Loader2, Search } from "lucide-react";
import {
  BOTSWANA_LOCATIONS,
  searchLocations as searchLocalLocations,
  findNearestTown,
  type BotswanaLocation,
} from "@/lib/botswanaLocations";
import {
  searchLocations as searchRemoteLocations,
  type SearchedLocation,
} from "@/lib/passengerApi";
import { getCurrentPosition, type GeoError } from "@/lib/geolocation";

interface LocationComboboxProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  enableGeolocation?: boolean;
}

/** Shared display shape used by the dropdown list — either source can produce it. */
interface DisplayLocation {
  name: string;
  region: string | null;
  lat: number;
  lng: number;
}

const ITEM_HEIGHT = 38;
const VISIBLE_ITEMS = 8;
const DEBOUNCE_MS = 250;

function fromHardcoded(loc: BotswanaLocation): DisplayLocation {
  return {
    name: loc.name,
    region: loc.region,
    lat: loc.lat,
    lng: loc.lng,
  };
}

function fromRemote(loc: SearchedLocation): DisplayLocation {
  return {
    name: loc.name,
    region: loc.region,
    lat: loc.lat,
    lng: loc.lng,
  };
}

/**
 * Merge two lists of locations, deduplicating by lowercased name. Local
 * results take priority over remote ones with the same name, because the
 * hardcoded entries carry curated region labels.
 */
function mergeUnique(
  local: DisplayLocation[],
  remote: DisplayLocation[]
): DisplayLocation[] {
  const seen = new Set<string>();
  const out: DisplayLocation[] = [];
  for (const loc of [...local, ...remote]) {
    const key = loc.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(loc);
  }
  return out;
}

export function LocationCombobox({
  label,
  placeholder,
  value,
  onChange,
  enableGeolocation = false,
}: LocationComboboxProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [detectedNear, setDetectedNear] = useState<string | null>(null);

  // Remote results fetched from the search endpoint
  const [remote, setRemote] = useState<DisplayLocation[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Synchronous local filter over the hardcoded list. Runs on every
  // keystroke, gives instant feedback while the remote search is debouncing.
  const localResults = useMemo<DisplayLocation[]>(() => {
    const local = searchLocalLocations(query, 9999);
    return local.map(fromHardcoded);
  }, [query]);

  // Debounced remote search. Fires DEBOUNCE_MS after the last keystroke,
  // and cancels any in-flight debounce when the query changes.
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setRemote([]);
      setRemoteLoading(false);
      setRemoteError(null);
      return;
    }

    setRemoteLoading(true);
    const mySeq = ++requestSeq.current;
    debounceTimer.current = setTimeout(async () => {
      try {
        const found = await searchRemoteLocations(trimmed);
        // Discard the response if a newer request has been issued
        if (mySeq !== requestSeq.current) return;
        setRemote(found.map(fromRemote));
        setRemoteError(null);
      } catch (e: any) {
        if (mySeq !== requestSeq.current) return;
        setRemoteError(e?.message ?? "Search failed");
        setRemote([]);
      } finally {
        if (mySeq === requestSeq.current) setRemoteLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  // The visible dropdown list: local + remote, deduplicated by name.
  const results = useMemo<DisplayLocation[]>(() => {
    if (query.trim().length < 2) {
      // No query — show the top of the hardcoded list as a starting menu
      return BOTSWANA_LOCATIONS.slice(0, 20).map(fromHardcoded);
    }
    return mergeUnique(localResults, remote);
  }, [query, localResults, remote]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const item = listRef.current.children[highlight] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [highlight, open]);

  const handleSelect = (loc: DisplayLocation) => {
    onChange(loc.name);
    setQuery(loc.name);
    setOpen(false);
    setGeoError(null);
    setDetectedNear(null);
  };

  const handleClear = () => {
    onChange("");
    setQuery("");
    setOpen(false);
    setGeoError(null);
    setDetectedNear(null);
    inputRef.current?.focus();
  };

  const handleUseGps = async () => {
    setLocating(true);
    setGeoError(null);
    setDetectedNear(null);

    const result = await getCurrentPosition({ timeoutMs: 10_000 });

    if ("error" in result) {
      const err: GeoError = result.error;
      setGeoError(err.message);
      setLocating(false);
      return;
    }

    const nearest = findNearestTown(result.coords.lat, result.coords.lng);
    if (!nearest) {
      setGeoError("Couldn't match your location to a town.");
      setLocating(false);
      return;
    }

    onChange(nearest.location.name);
    setQuery(nearest.location.name);
    setDetectedNear(
      `${nearest.location.name} · ${nearest.distanceKm.toFixed(1)} km away`
    );
    setOpen(false);
    setLocating(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = results[highlight];
      if (picked) handleSelect(picked);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const hasValue = query.length > 0;

  return (
    <div ref={wrapperRef} className="relative z-[9999]">
      <label className="mb-1 block text-xs font-medium text-neutral-500">
        {label}
      </label>

      <div className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 py-2 pl-9 pr-20 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-orange-600 focus:outline-none focus:ring-1 focus:ring-orange-600"
          />
          {hasValue && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-10 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
              aria-label="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {enableGeolocation && (
            <button
              type="button"
              onClick={handleUseGps}
              disabled={locating}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md bg-orange-600/20 text-orange-500 transition-colors hover:bg-orange-600/30 disabled:opacity-50"
              aria-label="Use my current location"
              title="Use my current location"
            >
              {locating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MapPin className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {detectedNear && (
        <div className="mt-1 flex items-center gap-1 text-xs text-green-500">
          <MapPin className="h-3 w-3" />
          Located: {detectedNear}
        </div>
      )}

      {geoError && (
        <div className="mt-1 text-xs text-amber-500">{geoError}</div>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-full z-[9999] mt-1 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl">
          {results.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-neutral-500">
              {remoteLoading
                ? "Searching…"
                : remoteError
                ? `Search unavailable: ${remoteError}`
                : `No locations found for "${query}"`}
            </div>
          ) : (
            <>
              <ul
                ref={listRef}
                role="listbox"
                className="overflow-y-auto py-1"
                style={{ maxHeight: `${ITEM_HEIGHT * VISIBLE_ITEMS}px` }}
              >
                {results.map((loc, i) => (
                  <li
                    key={loc.name + i}
                    role="option"
                    aria-selected={i === highlight}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(loc);
                    }}
                    className={`cursor-pointer px-3 py-2 text-sm ${
                      i === highlight
                        ? "bg-orange-600/20 text-orange-100"
                        : "text-neutral-200 hover:bg-neutral-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{loc.name}</span>
                      {loc.region && (
                        <span className="text-xs text-neutral-500">
                          {loc.region}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-neutral-800 px-3 py-1.5 text-[10px] text-neutral-500">
                <span>
                  {results.length} result{results.length === 1 ? "" : "s"} · scroll
                  for more
                </span>
                {remoteLoading && (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    searching
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}