"use server";

import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { TIMEZONE, isValidMember, isValidRoom } from "@/lib/config";
import { formatTime, isWorkingDate } from "@/lib/dates";
import { sql } from "@/lib/db";

export type ActionResult = { ok: true } | { ok: false; message: string };

type Input = {
  room: string;
  date: string;
  actor: string;
  /** Optional "HH:MM" in the working timezone; omitted means "now". */
  at?: string | null;
};

type CurrentRow = {
  placed_by: string | null;
  placed_at: string | Date | null;
  picked_by: string | null;
  picked_at: string | Date | null;
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function validate({ room, date, actor, at }: Input): string | null {
  if (!isValidRoom(room)) return "รหัสห้องไม่ถูกต้อง";
  if (!isWorkingDate(date)) return "วันที่อยู่นอกช่วงงาน";
  if (!isValidMember(actor)) return "กรุณาเลือกชื่อของคุณก่อน";
  if (at != null && at !== "" && !HHMM.test(at)) return "รูปแบบเวลาไม่ถูกต้อง";
  return null;
}

/** "HH:MM" or null for "now"; empty strings count as "now". */
function chosenTime(at: Input["at"]): string | null {
  return at ? at : null;
}

async function current(room: string, date: string): Promise<CurrentRow | null> {
  const rows = (await sql().query(
    `SELECT placed_by, placed_at, picked_by, picked_at
       FROM room_day WHERE room_code = $1 AND work_date = $2::date`,
    [room, date],
  )) as CurrentRow[];
  return rows[0] ?? null;
}

function at(value: string | Date | null): string {
  return value ? formatTime(new Date(value).toISOString()) : "";
}

// SQL fragment: the chosen time on the working day, interpreted in the working
// timezone, or now() when no time was chosen. Uses params $2 (date), $4 (HH:MM
// or null) and $5 (timezone).
const WHEN = `COALESCE((($2::date + $4::time) AT TIME ZONE $5), now())`;

/** Mark the document as placed. The first person to tap wins. */
export async function placeDocument(input: Input): Promise<ActionResult> {
  const error = validate(input);
  if (error) return { ok: false, message: error };
  const { room, date, actor } = input;
  const time = chosenTime(input.at);

  // Upsert so a missing seed row is created, but only take the "placed" slot
  // when it is still empty. 0 rows returned means someone else was first.
  const changed = await sql().query(
    `WITH changed AS (
       INSERT INTO room_day (room_code, work_date, placed_by, placed_at)
       VALUES ($1, $2::date, $3, ${WHEN})
       ON CONFLICT (room_code, work_date) DO UPDATE
         SET placed_by = EXCLUDED.placed_by, placed_at = EXCLUDED.placed_at, updated_at = now()
         WHERE room_day.placed_at IS NULL
       RETURNING room_code, work_date
     )
     INSERT INTO activity_log (room_code, work_date, action, actor, note)
     SELECT room_code, work_date, 'place', $3, $6 FROM changed
     RETURNING id`,
    [room, date, actor, time, TIMEZONE, time ? `เวลา ${time}` : null],
  );

  if (changed.length === 0) {
    const row = await current(room, date);
    revalidatePath("/");
    return {
      ok: false,
      message: row?.placed_by
        ? `ห้อง ${room} วางแล้วโดย ${row.placed_by} เมื่อ ${at(row.placed_at)}`
        : `ห้อง ${room} ถูกอัปเดตไปแล้ว กรุณาลองใหม่`,
    };
  }
  revalidatePath("/");
  return { ok: true };
}

/** Mark the document as picked up. Requires it to have been placed first. */
export async function pickupDocument(input: Input): Promise<ActionResult> {
  const error = validate(input);
  if (error) return { ok: false, message: error };
  const { room, date, actor } = input;
  const time = chosenTime(input.at);

  const changed = await sql().query(
    `WITH changed AS (
       UPDATE room_day
          SET picked_by = $3, picked_at = ${WHEN}, updated_at = now()
        WHERE room_code = $1 AND work_date = $2::date
          AND placed_at IS NOT NULL AND picked_at IS NULL
          AND placed_at <= ${WHEN}
       RETURNING room_code, work_date
     )
     INSERT INTO activity_log (room_code, work_date, action, actor, note)
     SELECT room_code, work_date, 'pickup', $3, $6 FROM changed
     RETURNING id`,
    [room, date, actor, time, TIMEZONE, time ? `เวลา ${time}` : null],
  );

  if (changed.length === 0) {
    const row = await current(room, date);
    revalidatePath("/");
    if (row?.picked_by) {
      return {
        ok: false,
        message: `ห้อง ${room} เก็บแล้วโดย ${row.picked_by} เมื่อ ${at(row.picked_at)}`,
      };
    }
    if (row?.placed_at) {
      return {
        ok: false,
        message: `เวลาเก็บต้องไม่ก่อนเวลาวาง (${at(row.placed_at)})`,
      };
    }
    return { ok: false, message: `ห้อง ${room} ยังไม่ได้วางเอกสาร` };
  }
  revalidatePath("/");
  return { ok: true };
}

/** Revert "placed" (only while not yet picked up). */
export async function undoPlace(input: Input): Promise<ActionResult> {
  const error = validate(input);
  if (error) return { ok: false, message: error };
  const { room, date, actor } = input;

  const changed = await sql().query(
    `WITH changed AS (
       UPDATE room_day
          SET placed_by = NULL, placed_at = NULL, updated_at = now()
        WHERE room_code = $1 AND work_date = $2::date
          AND placed_at IS NOT NULL AND picked_at IS NULL
       RETURNING room_code, work_date
     )
     INSERT INTO activity_log (room_code, work_date, action, actor)
     SELECT room_code, work_date, 'undo_place', $3 FROM changed
     RETURNING id`,
    [room, date, actor],
  );
  revalidatePath("/");
  if (changed.length === 0) {
    return { ok: false, message: `สถานะห้อง ${room} เปลี่ยนไปแล้ว กรุณาดูข้อมูลล่าสุด` };
  }
  return { ok: true };
}

/** Revert "picked up"; the room goes back to "placed". */
export async function undoPickup(input: Input): Promise<ActionResult> {
  const error = validate(input);
  if (error) return { ok: false, message: error };
  const { room, date, actor } = input;

  const changed = await sql().query(
    `WITH changed AS (
       UPDATE room_day
          SET picked_by = NULL, picked_at = NULL, updated_at = now()
        WHERE room_code = $1 AND work_date = $2::date AND picked_at IS NOT NULL
       RETURNING room_code, work_date
     )
     INSERT INTO activity_log (room_code, work_date, action, actor)
     SELECT room_code, work_date, 'undo_pickup', $3 FROM changed
     RETURNING id`,
    [room, date, actor],
  );
  revalidatePath("/");
  if (changed.length === 0) {
    return { ok: false, message: `สถานะห้อง ${room} เปลี่ยนไปแล้ว กรุณาดูข้อมูลล่าสุด` };
  }
  return { ok: true };
}

/** Save a free-text note on the room for that day (empty clears it). */
export async function saveNote(input: Input & { note: string }): Promise<ActionResult> {
  const error = validate(input);
  if (error) return { ok: false, message: error };
  const { room, date, actor } = input;
  const note = input.note.trim().slice(0, 500);

  await sql().query(
    `WITH changed AS (
       INSERT INTO room_day (room_code, work_date, note)
       VALUES ($1, $2::date, NULLIF($3, ''))
       ON CONFLICT (room_code, work_date) DO UPDATE
         SET note = NULLIF($3, ''), updated_at = now()
       RETURNING room_code, work_date
     )
     INSERT INTO activity_log (room_code, work_date, action, actor, note)
     SELECT room_code, work_date, 'note', $4, NULLIF($3, '') FROM changed
     RETURNING id`,
    [room, date, note, actor],
  );
  revalidatePath("/");
  return { ok: true };
}

type DayNoteInput = { date: string; actor: string; note: string };

/** Save (or clear) the author's day-wide note. Others see every member's note. */
export async function saveDayNote(input: DayNoteInput): Promise<ActionResult> {
  if (!isWorkingDate(input.date)) return { ok: false, message: "วันที่อยู่นอกช่วงงาน" };
  if (!isValidMember(input.actor)) return { ok: false, message: "กรุณาเลือกชื่อของคุณก่อน" };
  const note = input.note.trim().slice(0, 500);
  const { date, actor } = input;

  if (note === "") {
    await sql().query(
      `DELETE FROM day_notes WHERE work_date = $1::date AND author = $2`,
      [date, actor],
    );
  } else {
    await sql().query(
      `INSERT INTO day_notes (work_date, author, note)
       VALUES ($1::date, $2, $3)
       ON CONFLICT (work_date, author) DO UPDATE
         SET note = EXCLUDED.note, updated_at = now()`,
      [date, actor, note],
    );
  }
  // activity_log.room_code is NOT NULL; use '' as a sentinel for day-wide events.
  await sql().query(
    `INSERT INTO activity_log (room_code, work_date, action, actor, note)
     VALUES ('', $1::date, 'day_note', $2, NULLIF($3, ''))`,
    [date, actor, note],
  );
  revalidatePath("/");
  return { ok: true };
}

type DeletePhotoInput = { id: number; date: string; actor: string };

/** Delete a document photo (Vercel Blob + DB row + log). */
export async function deletePhoto(input: DeletePhotoInput): Promise<ActionResult> {
  if (!isWorkingDate(input.date)) return { ok: false, message: "วันที่อยู่นอกช่วงงาน" };
  if (!isValidMember(input.actor)) return { ok: false, message: "กรุณาเลือกชื่อของคุณก่อน" };
  const { id, date, actor } = input;

  const rows = (await sql().query(
    `SELECT room_code, pathname FROM room_photos
      WHERE id = $1 AND work_date = $2::date`,
    [id, date],
  )) as { room_code: string; pathname: string }[];
  const row = rows[0];
  if (!row) return { ok: false, message: "ไม่พบรูปนี้แล้ว" };

  // Best-effort Blob removal: if the blob is already gone, keep going so the
  // DB row doesn't get stuck.
  try {
    await del(row.pathname);
  } catch {
    /* ignored — the DB row removal is the source of truth for the UI */
  }

  await sql().query(`DELETE FROM room_photos WHERE id = $1`, [id]);
  await sql().query(
    `INSERT INTO activity_log (room_code, work_date, action, actor, note)
     VALUES ($1, $2::date, 'photo_delete', $3, $4)`,
    [row.room_code, date, actor, row.pathname],
  );
  revalidatePath("/");
  return { ok: true };
}
