import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isValidMember, isValidRoom } from "@/lib/config";
import { isWorkingDate } from "@/lib/dates";
import { sql } from "@/lib/db";

const MAX_PHOTOS_PER_ROOM_DAY = 2;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB — Vercel caps the full request at 4.5 MB anyway

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return bad("ไฟล์ไม่ถูกต้อง");

  const room = String(form.get("room") ?? "");
  const date = String(form.get("date") ?? "");
  const actor = String(form.get("actor") ?? "");
  const file = form.get("file");

  if (!isValidRoom(room)) return bad("รหัสห้องไม่ถูกต้อง");
  if (!isWorkingDate(date)) return bad("วันที่อยู่นอกช่วงงาน");
  if (!isValidMember(actor)) return bad("กรุณาเลือกชื่อของคุณก่อน");
  if (!(file instanceof File)) return bad("กรุณาเลือกไฟล์รูป");
  if (!file.type.startsWith("image/")) return bad("ไฟล์ต้องเป็นรูปภาพเท่านั้น");
  if (file.size === 0) return bad("ไฟล์ว่าง");
  if (file.size > MAX_BYTES) return bad("ไฟล์ใหญ่เกินไป (สูงสุด 8MB)");

  const db = sql();
  const existing = (await db.query(
    `SELECT COUNT(*)::int AS n FROM room_photos WHERE room_code = $1 AND work_date = $2::date`,
    [room, date],
  )) as { n: number }[];
  if ((existing[0]?.n ?? 0) >= MAX_PHOTOS_PER_ROOM_DAY) {
    return bad(`อัปโหลดได้ไม่เกิน ${MAX_PHOTOS_PER_ROOM_DAY} รูปต่อห้องต่อวัน`);
  }

  const ext = extensionFromType(file.type) ?? extensionFromName(file.name) ?? "jpg";
  const key = `rooms/${date}/${room}/${Date.now()}-${randomHex(6)}.${ext}`;

  let blob;
  try {
    blob = await put(key, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ";
    return bad(message, 500);
  }

  await db.query(
    `INSERT INTO room_photos (room_code, work_date, url, pathname, uploaded_by)
     VALUES ($1, $2::date, $3, $4, $5)`,
    [room, date, blob.url, blob.pathname, actor],
  );
  await db.query(
    `INSERT INTO activity_log (room_code, work_date, action, actor, note)
     VALUES ($1, $2::date, 'photo_add', $3, $4)`,
    [room, date, actor, blob.pathname],
  );
  revalidatePath("/");
  return NextResponse.json({ ok: true, url: blob.url, pathname: blob.pathname });
}

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function extensionFromType(type: string): string | null {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/gif": "gif",
  };
  return map[type.toLowerCase()] ?? null;
}

function extensionFromName(name: string): string | null {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : null;
}

function randomHex(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
