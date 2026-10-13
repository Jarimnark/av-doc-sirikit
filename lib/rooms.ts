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
};

export type LogAction = "place" | "pickup" | "undo_place" | "undo_pickup" | "note";

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

/** All rooms for one day, always in G01…G21 order, even if a row is missing. */
export async function getRoomsForDate(date: string): Promise<RoomView[]> {
  const rows = (await sql().query(
    `SELECT room_code, placed_by, placed_at, picked_by, picked_at, note
       FROM room_day
      WHERE work_date = $1::date`,
    [date],
  )) as RoomRow[];
  const byCode = new Map(rows.map((r) => [r.room_code, r]));

  return ROOM_CODES.map((code) => {
    const row = byCode.get(code);
    if (!row) {
      return {
        code,
        status: "pending",
        placedBy: null,
        placedAt: null,
        pickedBy: null,
        pickedAt: null,
        note: null,
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
    };
  });
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
