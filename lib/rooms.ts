import { ROOM_CODES } from "./config";
import { formatTime } from "./dates";
import { sql } from "./db";

export type RoomStatus = "pending" | "placed" | "picked";

export type RoomView = {
  code: string;
  status: RoomStatus;
  placedBy: string | null;
  placedAt: string | null; // "09:42", already in the working timezone
  pickedBy: string | null;
  pickedAt: string | null;
  note: string | null;
  photoCount: number;
};

export type RoomPhoto = {
  id: number;
  url: string;
  uploadedBy: string;
  time: string; // "09:42"
};

export type DayNote = {
  author: string;
  note: string;
  updatedAt: string; // "09:42"
};

export type LogAction =
  | "place"
  | "pickup"
  | "undo_place"
  | "undo_pickup"
  | "note"
  | "day_note"
  | "photo_add"
  | "photo_delete";

export type LogView = {
  id: number;
  room: string;
  action: LogAction;
  actor: string;
  note: string | null;
  time: string; // "09:42"
};

type RoomRow = {
  room_code: string;
  placed_by: string | null;
  placed_at: string | Date | null;
  picked_by: string | null;
  picked_at: string | Date | null;
  note: string | null;
};

type LogRow = {
  id: number | string;
  room_code: string;
  action: LogAction;
  actor: string;
  note: string | null;
  created_at: string | Date;
};

function timeLabel(value: string | Date | null): string | null {
  if (value === null) return null;
  return formatTime(new Date(value).toISOString());
}

export function statusOf(row: { placed_at: unknown; picked_at: unknown }): RoomStatus {
  if (row.picked_at) return "picked";
  if (row.placed_at) return "placed";
  return "pending";
}

/** All rooms for one day, always in configured order, even if a row is missing. */
export async function getRoomsForDate(date: string): Promise<RoomView[]> {
  const db = sql();
  const [rows, photoCounts] = (await Promise.all([
    db.query(
      `SELECT room_code, placed_by, placed_at, picked_by, picked_at, note
         FROM room_day
        WHERE work_date = $1::date`,
      [date],
    ),
    db.query(
      `SELECT room_code, COUNT(*)::int AS n
         FROM room_photos
        WHERE work_date = $1::date
        GROUP BY room_code`,
      [date],
    ),
  ])) as [RoomRow[], { room_code: string; n: number }[]];
  const byCode = new Map(rows.map((r) => [r.room_code, r]));
  const photoByCode = new Map(photoCounts.map((p) => [p.room_code, p.n]));

  return ROOM_CODES.map((code) => {
    const row = byCode.get(code);
    const photoCount = photoByCode.get(code) ?? 0;
    if (!row) {
      return {
        code,
        status: "pending",
        placedBy: null,
        placedAt: null,
        pickedBy: null,
        pickedAt: null,
        note: null,
        photoCount,
      };
    }
    return {
      code,
      status: statusOf(row),
      placedBy: row.placed_by,
      placedAt: timeLabel(row.placed_at),
      pickedBy: row.picked_by,
      pickedAt: timeLabel(row.picked_at),
      note: row.note,
      photoCount,
    };
  });
}

/** All photos for one day, grouped by room code (newest last so slot 1 → slot 2). */
export async function getPhotosForDate(date: string): Promise<Record<string, RoomPhoto[]>> {
  const rows = (await sql().query(
    `SELECT id, room_code, url, uploaded_by, created_at
       FROM room_photos
      WHERE work_date = $1::date
      ORDER BY room_code, created_at ASC, id ASC`,
    [date],
  )) as {
    id: number | string;
    room_code: string;
    url: string;
    uploaded_by: string;
    created_at: string | Date;
  }[];
  const out: Record<string, RoomPhoto[]> = {};
  for (const r of rows) {
    const list = out[r.room_code] ?? (out[r.room_code] = []);
    list.push({
      id: Number(r.id),
      url: r.url,
      uploadedBy: r.uploaded_by,
      time: timeLabel(r.created_at) ?? "",
    });
  }
  return out;
}

/** Day-wide notes for every member who has written one, newest first. */
export async function getDayNotes(date: string): Promise<DayNote[]> {
  const rows = (await sql().query(
    `SELECT author, note, updated_at
       FROM day_notes
      WHERE work_date = $1::date
      ORDER BY updated_at DESC`,
    [date],
  )) as { author: string; note: string; updated_at: string | Date }[];
  return rows.map((r) => ({
    author: r.author,
    note: r.note,
    updatedAt: timeLabel(r.updated_at) ?? "",
  }));
}

/** Activity for one day, newest first. */
export async function getLogForDate(date: string): Promise<LogView[]> {
  const rows = (await sql().query(
    `SELECT id, room_code, action, actor, note, created_at
       FROM activity_log
      WHERE work_date = $1::date
      ORDER BY created_at DESC, id DESC
      LIMIT 500`,
    [date],
  )) as LogRow[];
  return rows.map((r) => ({
    id: Number(r.id),
    room: r.room_code,
    action: r.action,
    actor: r.actor,
    note: r.note,
    time: timeLabel(r.created_at) ?? "",
  }));
}
