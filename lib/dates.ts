import { END_DATE, START_DATE, TIMEZONE } from "./config";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's calendar date in the working timezone, as YYYY-MM-DD. */
export function todayInZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Every working day from START_DATE to END_DATE, inclusive. */
export function workingDates(): string[] {
  const out: string[] = [];
  const cursor = new Date(`${START_DATE}T00:00:00Z`);
  const end = new Date(`${END_DATE}T00:00:00Z`);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function isWorkingDate(date: string): boolean {
  return ISO_DATE.test(date) && date >= START_DATE && date <= END_DATE;
}

/**
 * Pick the date the page should open on: the requested one when it is inside
 * the working period, otherwise today clamped into the period.
 */
export function resolveDate(requested: string | undefined): string {
  if (requested && isWorkingDate(requested)) return requested;
  const today = todayInZone();
  if (today < START_DATE) return START_DATE;
  if (today > END_DATE) return END_DATE;
  return today;
}

/** "13 ต.ค." style label for the date tabs. */
export function formatDayLabel(date: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "อ." style weekday label. */
export function formatWeekday(date: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "09:42" in the working timezone. */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}
