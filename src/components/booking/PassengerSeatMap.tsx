"use client";

import { useMemo, useEffect, useState } from "react";

function useWindowDimensions() {
  const [dims, setDims] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const measure = () => setDims({ width: window.innerWidth, height: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return dims;
}

export interface DbSeat {
  id: string;
  seat_number: number;
  row_number: number;
  column_number: number;
  seat_type: "FRONT" | "WINDOW" | "AISLE" | "BACK" | "STANDARD";
}

interface PassengerSeatMapProps {
  seats: DbSeat[];
  selectedSeatIds: string[];
  bookedSeatIds: string[];
  onToggleSeat: (seatId: string) => void;
  maxSeats: number;
  driverSide: "LEFT" | "RIGHT";
  seatConfig: any;
}

type Slot = DbSeat | "AISLE" | "GAP";

const MIRROR_FOR_RHD = false;

export function PassengerSeatMap({
  seats,
  selectedSeatIds,
  bookedSeatIds,
  onToggleSeat,
  maxSeats,
  driverSide,
  seatConfig,
}: PassengerSeatMapProps) {
  const { width, height } = useWindowDimensions();

  const leftCols: number = seatConfig?.leftCols ?? 2;
  const rightCols: number = seatConfig?.rightCols ?? 3;
  const firstRowLeft: number = seatConfig?.firstRowLeft ?? leftCols;
  const firstRowRight: number = seatConfig?.firstRowRight ?? rightCols;
  const mainRows: number | null = seatConfig?.rows ?? null;

  const rows = useMemo(() => {
    const map = new Map<number, DbSeat[]>();
    for (const seat of seats) {
      if (!map.has(seat.row_number)) map.set(seat.row_number, []);
      map.get(seat.row_number)!.push(seat);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([rowNumber, rowSeats]) => ({
        rowNumber,
        seats: [...rowSeats].sort((a, b) => a.column_number - b.column_number),
      }));
  }, [seats]);

  const buildSlots = (rowNumber: number, rowSeats: DbSeat[]): Slot[] => {
    const isBackRow = mainRows !== null && rowNumber > mainRows;
    if (isBackRow) return rowSeats;
    const isFirst = rowNumber === 1;
    const leftN = isFirst ? firstRowLeft : leftCols;
    const rightN = isFirst ? firstRowRight : rightCols;
    const byCol = new Map(rowSeats.map((s) => [s.column_number, s]));
    const left: Slot[] = Array.from({ length: leftCols }, (_, i) =>
      i < leftN ? byCol.get(i + 1) ?? "GAP" : "GAP"
    );
    const rightGap = rightCols - rightN;
    const right: Slot[] = Array.from({ length: rightCols }, (_, i) =>
      i >= rightGap ? byCol.get(leftN + (i - rightGap) + 1) ?? "GAP" : "GAP"
    );
    return [...left, "AISLE", ...right];
  };

  const handleSeatClick = (seatId: string) => {
    if (bookedSeatIds.includes(seatId)) return;
    if (selectedSeatIds.includes(seatId)) {
      onToggleSeat(seatId);
    } else if (selectedSeatIds.length < maxSeats) {
      onToggleSeat(seatId);
    }
  };

  // Fit the WHOLE bus on screen with no scrolling.
  // Everything around the seats (page margin, modal header, driver row, legend,
  // Back/Confirm buttons, bus walls) takes roughly FIXED_CHROME pixels, and the
  // driver row is one more seat-high. The rest is shared between all the rows.
  const FIXED_CHROME = 330;
  const gapY = 4;
  const totalRows = Math.max(rows.length, 1);
  const availableH = Math.max(160, height - FIXED_CHROME);
  const seatByHeight = Math.floor(
    (availableH - totalRows * gapY) / (totalRows + 1)
  );

  const totalCols = leftCols + rightCols;
  const aisleW = 14;
  const gapX = 4;
  const availableW = Math.min(width - 60, 360);
  const seatByWidth = Math.floor(
    (availableW - aisleW - totalCols * gapX) / totalCols
  );

  const seatSize = Math.max(14, Math.min(44, seatByHeight, seatByWidth));
  const fontSize = Math.max(7, Math.round(seatSize * 0.34));

  // Top-down seat, like a seat plan drawn from above: a big cushion with a
  // narrow backrest (and headrest) behind it. The bus faces up the screen, so
  // the backrest sits at the bottom of each seat.
  const SeatButton = ({ seat }: { seat: DbSeat }) => {
    const isBooked = bookedSeatIds.includes(seat.id);
    const isSelected = selectedSeatIds.includes(seat.id);
    const isDisabled = isBooked || (!isSelected && selectedSeatIds.length >= maxSeats);

    const palette = isSelected
      ? { cushion: "#ea580c", back: "#c2410c", edge: "#fdba74", text: "#ffffff" }
      : isBooked
      ? { cushion: "#3b1414", back: "#2a0f0f", edge: "#7f1d1d", text: "#ef4444" }
      : { cushion: "#52525b", back: "#3f3f46", edge: "#71717a", text: "#e4e4e7" };

    const backH = Math.max(5, Math.round(seatSize * 0.26));
    const cushionH = seatSize - backH + 2;
    const radius = Math.max(4, Math.round(seatSize * 0.22));

    return (
      <button
        type="button"
        onClick={() => handleSeatClick(seat.id)}
        disabled={isDisabled}
        className="relative shrink-0 transition-transform duration-150 active:scale-95"
        style={{
          width: seatSize,
          height: seatSize,
          opacity: isBooked ? 0.75 : isDisabled ? 0.35 : 1,
          cursor: isBooked ? "not-allowed" : isDisabled ? "default" : "pointer",
          filter: isSelected ? "drop-shadow(0 0 8px rgba(249,115,22,0.55))" : undefined,
        }}
        title={isBooked ? `Seat ${seat.seat_number} (Booked)` : `Seat ${seat.seat_number}`}
      >
        {/* Backrest */}
        <div
          className="absolute"
          style={{
            left: "6%",
            right: "6%",
            bottom: 0,
            height: backH,
            background: palette.back,
            border: `2px solid ${palette.edge}`,
            borderRadius: radius,
          }}
        >
          {seatSize >= 30 && (
            <div
              className="absolute"
              style={{
                left: "28%",
                right: "28%",
                top: "18%",
                bottom: "18%",
                borderRadius: 999,
                background: "rgba(255,255,255,0.14)",
              }}
            />
          )}
        </div>
        {/* Cushion */}
        <div
          className="absolute flex items-center justify-center"
          style={{
            left: 0,
            right: 0,
            top: 0,
            height: cushionH,
            background: palette.cushion,
            border: `2px solid ${palette.edge}`,
            borderRadius: radius,
            fontSize,
            fontWeight: 800,
            color: palette.text,
          }}
        >
          {seat.seat_number}
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col items-center w-full py-0">
      {/* CHANGED: p-0 and w-max to kiss the walls */}
      <div
        className="relative flex flex-col w-max rounded-t-[40px] rounded-b-xl border-x-4 border-t-4 border-neutral-700 bg-neutral-900/40 pt-2 pb-2 shadow-inner"
        style={{ maxWidth: 380 }}
      >
        <div
          className={`flex w-full items-center justify-between px-1 pb-2 mb-1.5 border-b-2 border-dashed border-neutral-800 ${
            driverSide === "RIGHT" ? "flex-row-reverse" : "flex-row"
          }`}
        >
          <div
            className="flex items-center justify-center rounded-full border-2 border-neutral-600 bg-neutral-800 text-neutral-500 shadow-md"
            style={{ width: seatSize, height: seatSize }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: seatSize * 0.5, height: seatSize * 0.5 }}>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 12v8" />
              <path d="M12 12H2" />
              <path d="M12 12h10" />
            </svg>
          </div>
          <div className="bg-red-500/20 border border-red-500/30 rounded" style={{ height: 6, width: seatSize * 1.2 }} />
        </div>

        <div className="flex flex-col w-full items-center" style={{ gap: gapY }}>
          {rows.map((row) => {
            let items = buildSlots(row.rowNumber, row.seats);
            if (MIRROR_FOR_RHD && driverSide === "RIGHT") items = [...items].reverse();

            return (
              <div key={row.rowNumber} className="flex items-center justify-center" style={{ gap: gapX }}>
                {items.map((item, index) => {
                  if (item === "AISLE") return <div key={`a${index}`} style={{ width: aisleW }} />;
                  if (item === "GAP") return <div key={`g${row.rowNumber}-${index}`} style={{ width: seatSize, height: seatSize }} />;
                  return <SeatButton key={item.id} seat={item} />;
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[10px] text-neutral-500">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-orange-600 border border-orange-500" />
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-neutral-700 border border-neutral-600" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-red-950 border border-red-900" />
          <span>Booked</span>
        </div>
      </div>
    </div>
  );
}