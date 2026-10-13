// Server-only configuration. Values can be overridden with environment
// variables on Vercel; the defaults match the current assignment.

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

/** The three people who share the walking. Shown in the "who are you" dropdown. */
export const TEAM_MEMBERS: readonly string[] = env(
  "TEAM_MEMBERS",
  "นับทอง,หมิว,รัน",
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** First and last working day, inclusive (YYYY-MM-DD). */
export const START_DATE = env("START_DATE", "2026-10-13");
export const END_DATE = env("END_DATE", "2026-10-20");

/** Rooms are G01 … G21. */
export const ROOM_PREFIX = env("ROOM_PREFIX", "G");
export const ROOM_COUNT = Number(env("ROOM_COUNT", "21"));

/** Used to decide what "today" is and to display times. */
export const TIMEZONE = env("TIMEZONE", "Asia/Bangkok");

export const ROOM_CODES: readonly string[] = Array.from(
  { length: ROOM_COUNT },
  (_, i) => `${ROOM_PREFIX}${String(i + 1).padStart(2, "0")}`,
);

export function isValidRoom(code: string): boolean {
  return ROOM_CODES.includes(code);
}

export function isValidMember(name: string): boolean {
  return TEAM_MEMBERS.includes(name);
}
