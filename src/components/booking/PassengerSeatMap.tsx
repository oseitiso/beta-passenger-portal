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

  const isDriverLeft = driverSide === "LEFT";
  const driverInline = seatConfig?.driverInline ?? false;

  // Build the visual layout based EXACTLY on the operator's configuration
  const layout = useMemo(() => {
    if (!seatConfig) return [];

    const leftCols = seatConfig.leftCols ?? 1;
    const rightCols = seatConfig.rightCols ?? 2;
    const firstRowLeft = seatConfig.firstRowLeft ?? leftCols;
    const firstRowRight = seatConfig.firstRowRight ?? rightCols;
    const secondRowLeft = seatConfig.secondRowLeft ?? leftCols;
    const secondRowRight = seatConfig.secondRowRight ?? rightCols;
    const mainRows = seatConfig.rows ?? 12;
    const backSeats = seatConfig.backseats ?? 0;

    const map: { row: number; left: DbSeat[]; right: DbSeat[]; isBack: boolean }[] = [];
    const seatMap = new Map<string, DbSeat>();
    for (const s of seats) {
      seatMap.set(`${s.row_number}-${s.column_number}`, s);
    }

    let currentDbRow = 1;

    for (let r = 1; r <= mainRows; r++) {
      let currentLeftCols = r === 1 ? firstRowLeft : (r === 2 ? secondRowLeft : leftCols);
      let currentRightCols = r === 1 ? firstRowRight : (r === 2 ? secondRowRight : rightCols);

      // If it's the first row AND the driver is inline, we remove 1 seat from the driver's side
      if (r === 1 && driverInline) {
        if (isDriverLeft) {
          currentLeftCols = Math.max(0, currentLeftCols - 1);
        } else {
          currentRightCols = Math.max(0, currentRightCols - 1);
        }
      }

      const leftSeats: DbSeat[] = [];
      const rightSeats: DbSeat[] = [];

      // Find the left seats in DB. We start at column 1.
      for (let c = 1; c <= currentLeftCols; c++) {
        const seat = seatMap.get(`${currentDbRow}-${c}`);
        if (seat) leftSeats.push(seat);
      }

      // Find the right seats in DB. We start at the next column after the left seats.
      const rightStartCol = currentLeftCols + 1;
      for (let c = 0; c < currentRightCols; c++) {
        let seat = seatMap.get(`${currentDbRow}-${rightStartCol + c}`);
        // If driver is inline right, the DB might have skipped column 1, so we try that
        if (!seat && r === 1 && driverInline && !isDriverLeft) {
           seat = seatMap.get(`${currentDbRow}-${c + 1}`);
        }
        if (seat) rightSeats.push(seat);
      }

      map.push({ row: r, left: leftSeats, right: rightSeats, isBack: false });
      currentDbRow++;
    }

    // Back Bench
    if (backSeats > 0) {
      const backRowSeats: DbSeat[] = [];
      for (let c = 1; c <= backSeats; c++) {
        const seat = seatMap.get(`${currentDbRow}-${c}`);
        if (seat) backRowSeats.push(seat);
      }
      map.push({ row: currentDbRow, left: backRowSeats, right: [], isBack: true });
    }

    return map;
  }, [seats, seatConfig, driverInline, isDriverLeft]);

  // Dynamic sizing to fit the whole bus
  const FIXED_CHROME = 320;
  const gapY = 6;
  const totalRowsCount = layout.length;
  const availableH = Math.max(160, height - FIXED_CHROME);
  const seatByHeight = Math.floor((availableH - totalRowsCount * gapY) / (totalRowsCount + (driverInline ? 0 : 1)));

  const maxCols = Math.max((seatConfig?.leftCols ?? 1) + (seatConfig?.rightCols ?? 2), seatConfig?.backseats ?? 0);
  const aisleW = 16;
  const gapX = 4;
  const availableW = Math.min(width - 60, 340);
  const seatByWidth = Math.floor((availableW - aisleW - maxCols * gapX) / maxCols);

  const seatSize = Math.max(16, Math.min(42, seatByHeight, seatByWidth));
  const fontSize = Math.max(8, Math.round(seatSize * 0.34));

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
        {seatSize >= 30 && (
          <div className="absolute top-1 left-1 right-1 h-1 rounded-full bg-white/10" />
        )}
        <span style={{ fontWeight: 700 }}>{seat.seat_number}</span>
      </button>
    );
  };

  const DriverWheel = () => (
    <div
      className="flex items-center justify-center rounded-full border-2 border-neutral-600 bg-neutral-800 text-neutral-500 shadow-md shrink-0"
      style={{ width: seatSize, height: seatSize }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: seatSize * 0.5, height: seatSize * 0.5 }}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 12v8" />
        <path d="M12 12H2" />
        <path d="M12 12h10" />
      </svg>
    </div>
  );

  return (
    <div className="flex flex-col items-center w-full py-0">
      <div
        className="relative flex flex-col w-max rounded-t-[40px] rounded-b-xl border-x-4 border-t-4 border-neutral-700 bg-neutral-900/40 p-1 pt-2 pb-2 shadow-inner"
        style={{ maxWidth: 380 }}
      >
        {/* Top Driver Row (only if NOT inline) */}
        {!driverInline && (
          <div
            className={`flex w-full items-center justify-between px-2 pb-2 mb-2 border-b-2 border-dashed border-neutral-800 ${
              isDriverLeft ? "flex-row" : "flex-row-reverse"
            }`}
          >
            <DriverWheel />
            <div className="bg-red-500/20 border border-red-500/30 rounded" style={{ height: 6, width: seatSize * 1.2 }} />
          </div>
        )}

        {/* Main Rows */}
        <div className="flex flex-col w-full items-center" style={{ gap: gapY }}>
          {layout.map((rowObj) => {
            if (rowObj.isBack) {
              return (
                <div key={`back-${rowObj.row}`} className="flex items-center justify-center w-full mt-2 border-t-2 border-dashed border-neutral-800 pt-2" style={{ gap: gapX }}>
                  {rowObj.left.map((seat) => <SeatButton key={seat.id} seat={seat} />)}
                </div>
              );
            }

            const isFirstRow = rowObj.row === 1;
            const showInlineDriverLeft = isFirstRow && driverInline && isDriverLeft;
            const showInlineDriverRight = isFirstRow && driverInline && !isDriverLeft;

            return (
              <div key={rowObj.row} className="flex w-full justify-between items-center px-1" style={{ gap: aisleW }}>
                
                {/* Left Side */}
                <div className="flex gap-1.5 justify-start items-center">
                  {showInlineDriverLeft && <DriverWheel />}
                  {rowObj.left.map((seat) => <SeatButton key={seat.id} seat={seat} />)}
                </div>

                {/* Right Side */}
                <div className="flex gap-1.5 justify-end items-center">
                  {rowObj.right.map((seat) => <SeatButton key={seat.id} seat={seat} />)}
                  {showInlineDriverRight && <DriverWheel />}
                </div>

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