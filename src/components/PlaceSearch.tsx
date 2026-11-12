"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";

export interface PlaceStop {
  id: string;
  name: string;
  city?: string | null;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Words that only describe the kind of stop. Used to work out the town when a stop has no city saved.
const GENERIC = new Set([
  "bus", "taxi", "combi", "kombi", "rank", "stop", "station", "terminal", "terminus", "depot", "stage", "interchange",
]);

/** The town or village a stop belongs to: its saved city, otherwise its name without "bus rank" and similar. */
export function placeOf(s: PlaceStop): string {
  const c = (s.city ?? "").trim();
  if (c) return c;
  const words = s.name.trim().split(/\s+/);
  while (words.length > 1 && GENERIC.has(norm(words[words.length - 1]))) words.pop();
  return words.join(" ");
}

interface Group {
  key: string;
  label: string;
  stops: PlaceStop[];
}

export function PlaceSearch({
  label,
  stops,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  stops: PlaceStop[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = stops.find((s) => s.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQ("");
      }
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("touchstart", down as any);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("touchstart", down as any);
    };
  }, [open]);

  const groups = useMemo<Group[]>(() => {
    const tokens = norm(q).split(" ").filter(Boolean);
    const map = new Map<string, Group>();
    for (const s of stops) {
      const loc = placeOf(s);
      const key = norm(loc);
      const hay = norm(s.name) + " " + key;
      // a match on the town shows every stop in that town
      const townMatch = tokens.every((t) => key.includes(t));
      const stopMatch = tokens.every((t) => hay.includes(t));
      if (tokens.length > 0 && !townMatch && !stopMatch) continue;
      let g = map.get(key);
      if (!g) {
        g = { key, label: loc, stops: [] };
        map.set(key, g);
      }
      g.stops.push(s);
    }
    const nq = norm(q);
    const out = Array.from(map.values());
    out.forEach((g) => g.stops.sort((a, b) => a.name.localeCompare(b.name)));
    out.sort((a, b) => {
      const sa = nq && a.key.startsWith(nq) ? 0 : 1;
      const sb = nq && b.key.startsWith(nq) ? 0 : 1;
      return sa - sb || a.label.localeCompare(b.label);
    });
    return out;
  }, [stops, q]);

  const flat = useMemo(() => groups.flatMap((g) => g.stops), [groups]);

  useEffect(() => {
    setActive(0);
  }, [q, open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function pick(s: PlaceStop) {
    onChange(s.id);
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && flat[active]) {
        e.preventDefault();
        pick(flat[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQ("");
    }
  }

  let idx = -1;
  const selectedPlace = selected ? placeOf(selected) : "";

  return (
    <div ref={boxRef} className="relative">
      <label className="block text-xs text-neutral-400">
        {label}
        <div className="relative mt-1">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={open ? q : (selected?.name ?? "")}
            placeholder={placeholder ?? "Type a town or stop"}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onKeyDown={onKey}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 py-2.5 pl-9 pr-9 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none"
          />
          {value && (
            <button
              type="button"
              aria-label={`Clear ${label}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange("");
                setQ("");
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-500 hover:text-neutral-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </label>

      {!open && selected && selectedPlace && norm(selectedPlace) !== norm(selected.name) && (
        <div className="mt-0.5 pl-1 text-[11px] text-neutral-500">{selectedPlace}</div>
      )}

      {open && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-[420px] overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl"
        >
          {groups.length === 0 ? (
            <div className="px-3 py-3 text-sm text-neutral-400">
              No town or stop matches &ldquo;{q}&rdquo;.
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.key}>
                <div className="sticky top-0 z-10 flex items-center justify-between bg-neutral-800 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  <span>{g.label}</span>
                  <span className="font-normal normal-case tracking-normal text-neutral-500">
                    {g.stops.length} stop{g.stops.length === 1 ? "" : "s"}
                  </span>
                </div>
                {g.stops.map((s) => {
                  idx += 1;
                  const i = idx;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="option"
                      aria-selected={s.id === value}
                      data-idx={i}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(s)}
                      onMouseEnter={() => setActive(i)}
                      className={
                        "flex w-full items-center justify-between px-3 py-2.5 text-left text-sm " +
                        (i === active ? "bg-neutral-800 " : "") +
                        (s.id === value ? "text-orange-300" : "text-neutral-100")
                      }
                    >
                      <span className="truncate">{s.name}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
