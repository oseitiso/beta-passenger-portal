"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { MapPin, X, Loader2, Search } from "lucide-react";
import {
  searchLocations,
  findNearestTown,
  type BotswanaLocation,
} from "@/lib/botswanaLocations";
import { getCurrentPosition, type GeoError } from "@/lib/geolocation";

interface LocationComboboxProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  enableGeolocation?: boolean;
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

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const results = useMemo(() => searchLocations(query, 20), [query]);

  const handleSelect = (loc: BotswanaLocation) => {
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
    // z-[9999] beats Leaflet's highest pane (z-700) so dropdown appears above the map
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
              setHighlight(0);
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
        <div className="absolute left-0 right-0 top-full z-[9999] mt-1 max-h-72 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl">
          {results.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-neutral-500">
              No locations found for "{query}"
            </div>
          ) : (
            <ul role="listbox" className="py-1">
              {results.map((loc, i) => (
                <li
                  key={loc.name}
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
                    <span className="text-xs text-neutral-500">
                      {loc.region}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}