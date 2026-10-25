"use client";

import { useMemo } from "react";

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

// The operator's saved layout already stores left/right exactly as drawn,
// so the seats are NOT mirrored. Set this to true only if the passenger map
// turns out to be the opposite way round to the operator's drawing.
const MIRROR_FOR_RHD = false;

type Slot = DbSeat | "AISLE" | "GAP";

export function PassengerSeatMap({
  seats,
  selectedSeatIds,
  bookedSeatIds,
  onToggleSeat,
  maxSeats,
  driverSide,
  seatConfig,
}: PassengerSeatMapProps) {
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
    // Back bench: every seat in one continuous row, no aisle.
    const isBackRow = mainRows !== null && rowNumber > mainRows;
    if (isBackRow) return rowSeats;

    const isFirst = rowNumber === 1;
    const leftN = isFirst ? firstRowLeft : leftCols;
    const rightN = isFirst ? firstRowRight : rightCols;
    const byCol = new Map(rowSeats.map((s) => [s.column_number, s]));

    // Seats sit against the outer walls; any gap falls next to the aisle.
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

  const SeatButton = ({ seat }: { seat: DbSeat }) => {
    const isBooked = bookedSeatIds.includes(seat.id);
    const isSelected = selectedSeatIds.includes(seat.id);
    const isDisabled =
      isBooked || (!isSelected && selectedSeatIds.length >= maxSeats);

    let bgClass = "bg-neutral-700 border-neutral-600 text-neutral-300";
    if (isSelected)
      bgClass =
        "bg-orange-600 border-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)]";
    else if (isBooked)
      bgClass =
        "bg-red-950 border-red-900 text-red-500 cursor-not-allowed opacity-50";

    return (
      <button
        type="button"
        onClick={() => handleSeatClick(seat.id)}
        disabled={isDisabled}
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-t-lg rounded-b-sm border-2 transition-all duration-150 ${bgClass} ${
          isDisabled && !isBooked ? "opacity-30" : ""
        }`}
        title={
          isBooked
            ? `Seat ${seat.seat_number} (Booked)`
            : `Seat ${seat.seat_number}`
        }
      >
        <div className="absolute top-1 left-1 right-1 h-1 rounded-full bg-white/10" />
        <span className="mt-1 text-[11px] font-bold tracking-tighter">
          {seat.seat_number}
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-col items-center w-full max-w-[320px] mx-auto py-4">
      <div className="relative flex flex-col w-full rounded-t-[40px] rounded-b-xl border-x-4 border-t-4 border-neutral-700 bg-neutral-900/40 p-4 pb-6 shadow-inner">
        {/* Driver area: steering wheel on the driver's side */}
        <div
          className={`flex w-full items-center justify-between px-2 pb-4 mb-4 border-b-2 border-dashed border-neutral-800 ${
            driverSide === "RIGHT" ? "flex-row-reverse" : "flex-row"
          }`}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-neutral-600 bg-neutral-800 text-neutral-500 shadow-md">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-5 w-5"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 12v8" />
              <path d="M12 12H2" />
              <path d="M12 12h10" />
            </svg>
          </div>
          <div className="bg-red-500/20 border border-red-500/30 rounded h-1.5 w-12" />
        </div>

        {/* Seat rows */}
        <div className="flex flex-col w-full gap-3">
          {rows.map((row) => {
            let items = buildSlots(row.rowNumber, row.seats);
            if (MIRROR_FOR_RHD && driverSide === "RIGHT") {
              items = [...items].reverse();
            }

            return (
              <div
                key={row.rowNumber}
                className="flex w-full justify-center items-center gap-2"
              >
                {items.map((item, index) => {
                  if (item === "AISLE") {
                    return (
                      <div key={`aisle-${index}`} className="w-6 shrink-0" />
                    );
                  }
                  if (item === "GAP") {
                    return (
                      <div
                        key={`gap-${row.rowNumber}-${index}`}
                        className="h-10 w-10 shrink-0"
                      />
                    );
                  }
                  return <SeatButton key={item.id} seat={item} />;
                })}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-[10px] text-neutral-500">
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
    </div>
  );
}