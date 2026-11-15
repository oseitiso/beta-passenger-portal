// Keeps pre-trip tickets and the live booking in step on this device.
import { getPretripRefs, removePretripRef, fetchPretrip, type PretripView } from "./pretrip";
import { getActiveBooking, saveActiveBooking, getBookingStatus, appendBookingHistory } from "./passengerBookingApi";

const NOTIFIED_KEY = "beta_pretrip_notified";
const TRIP_ENDED = ["COMPLETED", "CANCELLED", "MISSED"];
const finished = new Set<string>();

function readNotified(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function markNotified(ref: string): void {
  try {
    const list = readNotified();
    if (!list.includes(ref)) {
      list.push(ref);
      localStorage.setItem(NOTIFIED_KEY, JSON.stringify(list.slice(-30)));
    }
  } catch {
    /* storage unavailable */
  }
}

export interface PretripSyncResult {
  ticketsChanged: boolean;
  messages: string[];
}

function releaseMessage(v: any): string | null {
  const seats = Array.isArray(v.seat_numbers) && v.seat_numbers.length ? " " + v.seat_numbers.join(", ") : "";
  const route = v.route ? v.route + ": " : "";
  switch (v.release_reason) {
    case "BUS_LEFT_EARLY":
      return route + "the bus has left early. Your pre-booked seat" + seats + " has been released. If the bus has not yet left your stop, open the map and book again.";
    case "UNCLAIMED":
      return route + "your seat" + seats + " was released because it was not claimed in time. You can still request a live seat when the bus starts.";
    case "TRIP_CANCELLED":
      return route + "the trip was cancelled and your seat" + seats + " was released.";
    case "TRIP_CHANGED":
      return route + "the trip changed, so your seat" + seats + " was released. Please check Upcoming trips.";
    default:
      return null;
  }
}

/** Moves an ended pre-trip booking into the trip history. Returns false when it should be retried later. */
async function archiveEnded(v: any): Promise<boolean> {
  try {
    const res = await getBookingStatus(v.reference);
    const b = res.booking;
    if (res.success && b) {
      appendBookingHistory({
        handoff_id: b.handoff_id,
        booking_reference: b.booking_reference,
        handoff_status: b.pickup_disruption_flag === true ? "DISRUPTED" : b.handoff_status,
        from_stop_name: b.from_stop_name ?? null,
        to_stop_name: b.to_stop_name ?? null,
        route_origin: b.route_origin ?? null,
        route_destination: b.route_destination ?? null,
        requested_seats: b.requested_seats,
        passenger_name: b.passenger_name ?? null,
        ended_at: Date.now(),
      });
      return true;
    }
  } catch {
    return false;
  }
  appendBookingHistory({
    handoff_id: String(v.handoff_id ?? v.reference),
    booking_reference: v.reference,
    handoff_status: v.trip_status === "COMPLETED" ? "COMPLETED" : "CANCELLED",
    from_stop_name: v.from_name ?? null,
    to_stop_name: v.to_name ?? null,
    route_origin: null,
    route_destination: null,
    requested_seats: Array.isArray(v.seat_numbers) ? v.seat_numbers.length : 1,
    passenger_name: v.name ?? null,
    ended_at: Date.now(),
  });
  return true;
}

export async function processPretripViews(views: PretripView[]): Promise<PretripSyncResult> {
  const out: PretripSyncResult = { ticketsChanged: false, messages: [] };
  for (const raw of views) {
    const v = raw as any;
    const ref = String(v?.reference ?? "");
    if (!ref || finished.has(ref)) continue;
    const state = String(v.state);
    const tripEnded = TRIP_ENDED.includes(String(v.trip_status));

    if (state === "CLAIMED" || state === "BOARDED") {
      if (tripEnded) {
        if (await archiveEnded(v)) {
          removePretripRef(ref);
          finished.add(ref);
        }
        continue;
      }
      // A claimed or boarded seat is a normal ticket: the map finds the bus through it.
      if (!getActiveBooking()) {
        const departs = Date.parse(String(v.departs_at ?? ""));
        saveActiveBooking({
          handoff_id: String(v.handoff_id ?? ""),
          booking_reference: ref,
          pickup_id: "",
          token: "",
          expires_at: new Date((isNaN(departs) ? Date.now() : departs) + 12 * 3600 * 1000).toISOString(),
        });
        out.ticketsChanged = true;
      }
    } else if (state === "RELEASED" || state === "CANCELLED") {
      if (state === "RELEASED" && !readNotified().includes(ref)) {
        markNotified(ref);
        const releasedAt = Date.parse(String(v.released_at ?? ""));
        const recent = !isNaN(releasedAt) && Date.now() - releasedAt < 2 * 3600 * 1000;
        const msg = recent ? releaseMessage(v) : null;
        if (msg) out.messages.push(msg);
      }
      finished.add(ref);
    }
  }
  return out;
}

export async function syncPretripTickets(): Promise<PretripSyncResult> {
  if (typeof window === "undefined") return { ticketsChanged: false, messages: [] };
  const refs = getPretripRefs().filter((r) => !finished.has(r));
  if (refs.length === 0) return { ticketsChanged: false, messages: [] };
  const views: PretripView[] = [];
  await Promise.all(
    refs.map(async (r) => {
      try {
        const res = await fetchPretrip(r);
        if (res.view) views.push(res.view);
      } catch {
        /* try again on the next check */
      }
    })
  );
  return processPretripViews(views);
}