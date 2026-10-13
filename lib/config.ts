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

/** Used to decide what "today" is and to display times. */
export const TIMEZONE = env("TIMEZONE", "Asia/Bangkok");

/** The rooms, in display order. G18 is not part of the round; G22 is. */
export const ROOM_CODES: readonly string[] = env(
  "ROOMS",
  "G01,G02,G03,G04,G05,G06,G07,G08,G09,G10,G11,G12,G13,G14,G15,G16,G17,G19,G20,G21,G22",
)
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

export function isValidRoom(code: string): boolean {
  return ROOM_CODES.includes(code);
}

export function isValidMember(name: string): boolean {
  return TEAM_MEMBERS.includes(name);
}
