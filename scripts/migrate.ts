/**
 * Creates the tables (idempotent) and seeds one room_day row for every room
 * on every working day. Safe to run more than once.
 *
 *   npm run db:migrate
 *
 * Reads DATABASE_URL from .env.local (or the environment).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Put it in .env.local first.");
    process.exit(1);
  }

  // Imported after the env files are loaded so lib/config and lib/db see them.
  const [{ sql }, { ROOM_CODES }, { workingDates }] = await Promise.all([
    import("../lib/db"),
    import("../lib/config"),
    import("../lib/dates"),
  ]);
  const db = sql();

  // The Neon HTTP driver runs one statement per request, so split the file.
  const schema = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  const statements = schema
    .split(";")
    .map((s) => s.replace(/--[^\n]*/g, "").trim())
    .filter(Boolean);
  for (const statement of statements) {
    await db.query(statement);
  }
  console.log(`Schema ready (${statements.length} statements).`);

  const dates = workingDates();
  const rooms = [...ROOM_CODES];
  const roomParams = rooms.flatMap((room) => dates.map((date) => [room, date]));
  const values = roomParams
    .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}::date)`)
    .join(", ");
  await db.query(
    `INSERT INTO room_day (room_code, work_date) VALUES ${values}
     ON CONFLICT (room_code, work_date) DO NOTHING`,
    roomParams.flat(),
  );
  console.log(
    `Seeded ${rooms.length} rooms × ${dates.length} days ` +
      `(${dates[0]} – ${dates[dates.length - 1]}); existing rows were kept.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
