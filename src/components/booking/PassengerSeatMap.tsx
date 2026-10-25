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

  const topChrome = 140;
  const bottomPadding = 40;
  const gapY = 6;
  const totalRows = Math.max(rows.length, 1);
  const availableH = Math.max(200, height - topChrome - bottomPadding);

  const seatByHeight = Math.floor(
    (availableH - (totalRows - 1) * gapY) / totalRows - 4
  );

  const totalCols = leftCols + rightCols;
  const aisleW = 16;
  const gapX = 4;
  const availableW = Math.min(width - 60, 360);
  const seatByWidth = Math.floor(
    (availableW - aisleW - totalCols * gapX) / totalCols
  );

  const seatSize = Math.max(20, Math.min(48, seatByHeight, seatByWidth));
  const fontSize = Math.max(8, Math.round(seatSize * 0.32));

  const SeatButton = ({ seat }: { seat: DbSeat }) => {
    const isBooked = bookedSeatIds.includes(seat.id);
    const isSelected = selectedSeatIds.includes(seat.id);
    const isDisabled = isBooked || (!isSelected && selectedSeatIds.length >= maxSeats);

    let bgClass = "bg-neutral-700 border-neutral-600 text-neutral-300";
    if (isSelected) bgClass = "bg-orange-600 border-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)]";
    else if (isBooked) bgClass = "bg-red-950 border-red-900 text-red-500 cursor-not-allowed opacity-50";

    return (
      <button
        type="button"
        onClick={() => handleSeatClick(seat.id)}
        disabled={isDisabled}
        className={`relative flex shrink-0 items-center justify-center rounded-t-lg rounded-b-sm border-2 transition-all duration-150 ${bgClass} ${
          isDisabled && !isBooked ? "opacity-30" : ""
        }`}
        style={{ width: seatSize, height: seatSize, fontSize }}
        title={isBooked ? `Seat ${seat.seat_number} (Booked)` : `Seat ${seat.seat_number}`}
      >
        {seatSize >= 26 && (
          <div className="absolute top-1 left-1 right-1 h-1 rounded-full bg-white/10" />
        )}
        <span style={{ fontWeight: 700 }}>{seat.seat_number}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col items-center w-full py-2">
      {/* CHANGED: p-0 and w-max to kiss the walls */}
      <div
        className="relative flex flex-col w-max rounded-t-[40px] rounded-b-xl border-x-4 border-t-4 border-neutral-700 bg-neutral-900/40 pt-3 pb-4 shadow-inner"
        style={{ maxWidth: 380 }}
      >
        <div
          className={`flex w-full items-center justify-between px-1 pb-3 mb-2 border-b-2 border-dashed border-neutral-800 ${
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

      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[10px] text-neutral-500">
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