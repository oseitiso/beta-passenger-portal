"use client";

import { X, Eye, EyeOff, Layers } from "lucide-react";

export type FilterMode = "hide" | "dim";

interface FilterControlsProps {
  /** Number of buses currently visible after filter */
  visibleCount: number;
  /** Total buses in the system */
  totalCount: number;
  /** True when any filter (origin or destination) is active */
  filterActive: boolean;
  /** Current display mode for non-matching buses */
  mode: FilterMode;
  /** Called when user toggles between hide/dim */
  onModeChange: (mode: FilterMode) => void;
  /** Called when user clicks "Clear all" */
  onClear: () => void;
}

export function FilterControls({
  visibleCount,
  totalCount,
  filterActive,
  mode,
  onModeChange,
  onClear,
}: FilterControlsProps) {
  // Nothing to show if no filter and no ambiguity
  if (!filterActive && visibleCount === totalCount) return null;

  const hiddenCount = totalCount - visibleCount;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-xs">
      {/* Status */}
      <div className="flex items-center gap-2">
        {filterActive ? (
          <>
            <span className="font-medium text-orange-500">
              Filtering active
            </span>
            <span className="text-neutral-500">
              · showing {visibleCount} of {totalCount} bus
              {totalCount === 1 ? "" : "es"}
            </span>
          </>
        ) : (
          <span className="text-neutral-500">
            {totalCount} bus{totalCount === 1 ? "" : "es"} on the road
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Mode toggle */}
        {filterActive && hiddenCount > 0 && (
          <button
            onClick={() => onModeChange(mode === "hide" ? "dim" : "hide")}
            className="flex items-center gap-1.5 rounded-md border border-neutral-700 px-2 py-1 text-neutral-300 transition-colors hover:bg-neutral-800"
            title={
              mode === "hide"
                ? "Currently hiding non-matching buses. Click to dim instead."
                : "Currently dimming non-matching buses. Click to hide instead."
            }
          >
            {mode === "hide" ? (
              <>
                <EyeOff className="h-3 w-3" />
                Hide others
              </>
            ) : (
              <>
                <Eye className="h-3 w-3" />
                Dim others
              </>
            )}
          </button>
        )}

        {/* Clear all */}
        {filterActive && (
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 rounded-md bg-orange-600/20 px-2 py-1 font-medium text-orange-400 transition-colors hover:bg-orange-600/30"
          >
            <X className="h-3 w-3" />
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}