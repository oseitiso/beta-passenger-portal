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

type Slot = DbSeat | "GAP";

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
  const secondRowLeft: number = seatConfig?.secondRowLeft ?? leftCols;
  const secondRowRight: number = seatConfig?.secondRowRight ?? rightCols;
  const mainRows: number = seatConfig?.rows ?? 12;
  const backSeats: number = seatConfig?.backseats ?? 0;
  const driverInline = seatConfig?.driverInline ?? false;
  const isDriverLeft = driverSide === "LEFT";

  // Create a lookup map for seats
  const seatMap = useMemo(() => {
    const map = new Map<string, DbSeat>();
    for (const s of seats) {
      map.set(`${s.row_number}-${s.column_number}`, s);
    }
    return map;
  }, [seats]);

  // Build the visual layout exactly like the Operator Portal
  const layout = useMemo(() => {
    const map: { row: number; left: Slot[]; right: Slot[]; isBack: boolean }[] = [];
    
    let currentDbRow = 1;

    for (let r = 1; r <= mainRows; r++) {
      let currentLeftCols = r === 1 ? firstRowLeft : (r === 2 ? secondRowLeft : leftCols);
      let currentRightCols = r === 1 ? firstRowRight : (r === 2 ? secondRowRight : rightCols);

      const isFirst = r === 1;
      const showInlineDriverLeft = isFirst && driverInline && isDriverLeft;
      const showInlineDriverRight = isFirst && driverInline && !isDriverLeft;

      // If it's the first row AND the driver is inline, we remove 1 seat slot visually
      if (r === 1 && driverInline) {
        if (isDriverLeft) {
          currentLeftCols = Math.max(0, currentLeftCols - 1);
        } else {
          currentRightCols = Math.max(0, currentRightCols - 1);
        }
      }

      const leftSlots: Slot[] = [];
      const rightSlots: Slot[] = [];

      // Find the left seats in DB (start at column 1)
      for (let c = 1; c <= currentLeftCols; c++) {
        const seat = seatMap.get(`${currentDbRow}-${c}`);
        leftSlots.push(seat ?? "GAP");
      }

      // Find the right seats in DB
      for (let c = 1; c <= currentRightCols; c++) {
        let seat = seatMap.get(`${currentDbRow}-${currentLeftCols + c}`);
        // If driver is inline right, the DB might have skipped column 1
        if (!seat && r === 1 && driverInline && !isDriverLeft) {
           seat = seatMap.get(`${currentDbRow}-${c + 1}`);
        }
        rightSlots.push(seat ?? "GAP");
      }

      map.push({ 
        row: r, 
        left: leftSlots, 
        right: rightSlots, 
        isBack: false 
      });
      currentDbRow++;
    }

    // Back Bench
    if (backSeats > 0) {
      const backRowSlots: Slot[] = [];
      for (let c = 1; c <= backSeats; c++) {
        const seat = seatMap.get(`${currentDbRow}-${c}`);
        backRowSlots.push(seat ?? "GAP");
      }
      map.push({ row: currentDbRow, left: backRowSlots, right: [], isBack: true });
    }

    return map;
  }, [seatMap, leftCols, rightCols, firstRowLeft, firstRowRight, secondRowLeft, secondRowRight, mainRows, backSeats, driverInline, isDriverLeft]);

  const handleSeatClick = (seatId: string) => {
    if (bookedSeatIds.includes(seatId)) return;
    if (selectedSeatIds.includes(seatId)) {
      onToggleSeat(seatId);
    } else if (selectedSeatIds.length < maxSeats) {
      onToggleSeat(seatId);
    }
  };

  const FIXED_CHROME = 330;
  const gapY = 4;
  const totalRows = Math.max(layout.length, 1);
  const availableH = Math.max(160, height - FIXED_CHROME);
  const seatByHeight = Math.floor(
    (availableH - totalRows * gapY) / (totalRows + (driverInline ? 0 : 1))
  );

  const maxCols = Math.max(leftCols + rightCols, backSeats, 1);
  const aisleW = 14;
  const gapX = 4;
  const availableW = Math.min(width - 60, 360);
  const seatByWidth = Math.floor(
    (availableW - aisleW - maxCols * gapX) / maxCols
  );

  const seatSize = Math.max(14, Math.min(44, seatByHeight, seatByWidth));
  const fontSize = Math.max(7, Math.round(seatSize * 0.34));

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
        {/* Top driver row (only if NOT inline) */}
        {!driverInline && (
          <div
            className={`flex w-full items-center justify-between px-1 pb-2 mb-1.5 border-b-2 border-dashed border-neutral-800 ${
              isDriverLeft ? "flex-row" : "flex-row-reverse"
            }`}
          >
            <DriverWheel />
            <div className="bg-red-500/20 border border-red-500/30 rounded" style={{ height: 6, width: seatSize * 1.2 }} />
          </div>
        )}

        {/* Rows */}
        <div className="flex flex-col w-full items-center" style={{ gap: gapY }}>
          {layout.map((rowObj) => {
            if (rowObj.isBack) {
              return (
                <div
                  key={`back-${rowObj.row}`}
                  className="flex items-center justify-center w-full mt-2 pt-2 border-t-2 border-dashed border-neutral-800"
                  style={{ gap: gapX }}
                >
                  {rowObj.left.map((slot, i) => {
                    if (slot === "GAP") return <div key={`gap-${i}`} style={{ width: seatSize, height: seatSize }} />;
                    return <SeatButton key={slot.id} seat={slot} />;
                  })}
                </div>
              );
            }

            const isFirstRow = rowObj.row === 1;
            const showDriverLeft = isFirstRow && driverInline && isDriverLeft;
            const showDriverRight = isFirstRow && driverInline && !isDriverLeft;

            return (
              <div
                key={rowObj.row}
                className="flex w-full justify-between items-center px-1"
                style={{ gap: aisleW }}
              >
                <div className="flex items-center" style={{ gap: gapX }}>
                  {showDriverLeft && <DriverWheel />}
                  {rowObj.left.map((slot, i) => {
                    if (slot === "GAP") return <div key={`gap-${i}`} style={{ width: seatSize, height: seatSize }} />;
                    return <SeatButton key={slot.id} seat={slot} />;
                  })}
                </div>

                <div className="flex items-center" style={{ gap: gapX }}>
                  {rowObj.right.map((slot, i) => {
                    if (slot === "GAP") return <div key={`gap-${i}`} style={{ width: seatSize, height: seatSize }} />;
                    return <SeatButton key={slot.id} seat={slot} />;
                  })}
                  {showDriverRight && <DriverWheel />}
                </div>
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