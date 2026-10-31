// seatLayout.ts
//
// ONE layout rule shared by every screen that draws a bus: the operator
// editor, the live seat map, the passenger seat picker and the driver seat
// picker. Keep the four copies identical. The database function
// generate_vehicle_seats follows the same rule when it creates the seats.
//
// What a layout can express
//   * aisle "MIDDLE" (default): left block, a gap, right block.
//   * aisle "NONE": one continuous bench-style row, centred (combis).
//   * per-row overrides: any row can have its own left / right / jump counts.
//   * jump seats: fold-down seats that sit IN the aisle of a row (MIDDLE only).
//
// Seats are stored in vehicle_seats by (row_number, column_number):
//   left seats   -> columns 1 .. L
//   right seats  -> columns L+1 .. L+R
//   jump seats   -> columns L+R+1 .. L+R+J   (seat_type = 'JUMP')
//   back bench   -> row (rows + 1), columns 1 .. backseats

export type AisleMode = "MIDDLE" | "NONE";

export interface RowOverride {
  left?: number;
  right?: number;
  jump?: number;
}

export interface LayoutConfig {
  rows?: number;
  leftCols?: number;
  rightCols?: number;
  firstRowLeft?: number;
  firstRowRight?: number;
  secondRowLeft?: number;
  secondRowRight?: number;
  backseats?: number;
  driverSide?: "LEFT" | "RIGHT";
  driverInline?: boolean;
  aisle?: AisleMode;
  rowOverrides?: Record<string, RowOverride> | null;
}

export interface RowPlan {
  row: number;
  left: number;
  right: number;
  jump: number;
}

export interface SeatLike {
  id: string;
  row_number: number;
  column_number: number;
}

export interface LayoutRow<S extends SeatLike> {
  row: number;
  left: S[];
  right: S[];
  jump: S[];
  isBack: boolean;
}

export const MAX_JUMP_PER_ROW = 3;

const num = (v: unknown, d: number): number =>
  typeof v === "number" && isFinite(v) ? Math.max(0, Math.floor(v)) : d;

export function aisleMode(c: LayoutConfig | null | undefined): AisleMode {
  return c?.aisle === "NONE" ? "NONE" : "MIDDLE";
}

/** Seat counts for a main row BEFORE the inline-driver seat is taken off. */
export function baseRowCounts(c: LayoutConfig | null | undefined, r: number): { left: number; right: number } {
  const L = num(c?.leftCols, 2);
  const R = num(c?.rightCols, 3);
  let left = r === 1 ? num(c?.firstRowLeft, L) : r === 2 ? num(c?.secondRowLeft, L) : L;
  let right = r === 1 ? num(c?.firstRowRight, R) : r === 2 ? num(c?.secondRowRight, R) : R;
  const ov = c?.rowOverrides?.[String(r)];
  if (ov) {
    if (ov.left != null) left = num(ov.left, left);
    if (ov.right != null) right = num(ov.right, right);
  }
  return { left, right };
}

/** The seats each main row really has (inline driver and jump seats applied). */
export function getRowPlan(c: LayoutConfig | null | undefined): RowPlan[] {
  const rows = num(c?.rows, 12);
  const none = aisleMode(c) === "NONE";
  const inline = !!c?.driverInline;
  const driverLeft = (c?.driverSide ?? "LEFT") === "LEFT";
  const plan: RowPlan[] = [];
  for (let r = 1; r <= rows; r++) {
    let { left, right } = baseRowCounts(c, r);
    if (r === 1 && inline) {
      if (driverLeft) left = Math.max(0, left - 1);
      else right = Math.max(0, right - 1);
    }
    const jump = none ? 0 : Math.min(MAX_JUMP_PER_ROW, num(c?.rowOverrides?.[String(r)]?.jump, 0));
    plan.push({ row: r, left, right, jump });
  }
  return plan;
}

/** Total seats the layout produces (main rows + jump seats + back bench). */
export function countSeats(c: LayoutConfig | null | undefined): number {
  return getRowPlan(c).reduce((s, p) => s + p.left + p.right + p.jump, 0) + num(c?.backseats, 0);
}

/** Widest row in seats, used to size the seats to fit the screen. */
export function layoutMetrics(c: LayoutConfig | null | undefined): { maxCols: number; aisle: AisleMode } {
  const plan = getRowPlan(c);
  const widest = plan.reduce((m, p) => Math.max(m, p.left + p.right + p.jump), 0);
  return { maxCols: Math.max(widest, num(c?.backseats, 0), 1), aisle: aisleMode(c) };
}

/** Lay the saved seats out row by row, following the plan. */
export function buildRows<S extends SeatLike>(seats: S[], c: LayoutConfig | null | undefined): LayoutRow<S>[] {
  const byPos = new Map<string, S>();
  for (const s of seats) byPos.set(`${s.row_number}-${s.column_number}`, s);

  const inline = !!c?.driverInline;
  const driverLeft = (c?.driverSide ?? "LEFT") === "LEFT";
  const plan = getRowPlan(c);
  const out: LayoutRow<S>[] = [];

  for (const p of plan) {
    const left: S[] = [];
    const right: S[] = [];
    const jump: S[] = [];
    for (let i = 1; i <= p.left; i++) {
      const s = byPos.get(`${p.row}-${i}`);
      if (s) left.push(s);
    }
    for (let i = 1; i <= p.right; i++) {
      let s = byPos.get(`${p.row}-${p.left + i}`);
      // older buses with the driver inline on the right were numbered from column 1
      if (!s && p.row === 1 && inline && !driverLeft) s = byPos.get(`${p.row}-${i + 1}`);
      if (s) right.push(s);
    }
    for (let i = 1; i <= p.jump; i++) {
      const s = byPos.get(`${p.row}-${p.left + p.right + i}`);
      if (s) jump.push(s);
    }
    out.push({ row: p.row, left, right, jump, isBack: false });
  }

  const back = num(c?.backseats, 0);
  if (back > 0) {
    const backRow = plan.length + 1;
    const bench: S[] = [];
    for (let i = 1; i <= back; i++) {
      const s = byPos.get(`${backRow}-${i}`);
      if (s) bench.push(s);
    }
    out.push({ row: backRow, left: bench, right: [], jump: [], isBack: true });
  }
  return out;
}
