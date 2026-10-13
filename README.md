# AV Doc Sirikit — Room Document Tracker

A small, mobile-friendly web app for a 3-person team that delivers and collects documents across the rooms of a large hall. It shows, at a glance, which rooms already have today's document **placed** and which have been **picked up**, so nobody walks to a room someone else has already handled.

> Personal/internal tool. There are no logins: you pick your name from a dropdown.

---

## The problem

- There are **21 rooms**: `G01` – `G21`.
- Every room gets **one document per day**.
- Each day, every document has to be **placed** in its room and later **picked up**.
- **3 people** share the walking. Without a shared record, two people can end up going to the same room while another room gets missed.
- The work runs from **13 Oct 2026 to 18 Oct 2026**: 6 days × 21 rooms = **126 room-days**, each needing a place and a pick-up.

## What the app does

1. **Who are you?** On first visit, choose your name from a dropdown (3 fixed names). The choice is remembered on that phone/browser and can be changed at any time from the header.
2. **Pick the day.** The app opens on today's date. You can switch to any day from 13–18 Oct to review or fix earlier records.
3. **See every room at once.** A grid of 21 room cards (G01–G21), colour-coded by status:

   | Status        | Meaning                                  | Colour  |
   | ------------- | ---------------------------------------- | ------- |
   | `Pending`     | Document not placed yet                  | Grey    |
   | `Placed`      | Document is in the room, waiting for pick-up | Amber |
   | `Picked up`   | Document collected, room done for the day | Green  |

4. **Update with one tap.** Tap a room, then:
   - **Mark placed** records *who* and *when* (server time).
   - **Mark picked up** records *who* and *when*.
   - **Undo** reverts the last step if you tapped by mistake. Undo is logged too.
   - An optional **note** field is there for things like "room locked" or "left with staff".
5. **No double work.** If two people tap the same room at almost the same moment, only the first update wins. The second person sees "Already placed by *Name* at 09:42" instead of overwriting it.
6. **Stays up to date.** The room grid refreshes itself every few seconds and whenever the page comes back to the foreground, so everyone sees the same picture without reloading.
7. **Daily summary.** A header bar shows progress for the selected day, e.g. `Placed 15/21 · Picked up 9/21`, with filters such as *Not placed* or *Waiting for pick-up*.
8. **History.** Each room shows a small timeline of its actions (who, what, when) for that day.

## Tech stack

| Layer      | Choice                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| Framework  | [Next.js](https://nextjs.org/) (App Router, Server Components + Server Actions), TypeScript |
| Styling    | Tailwind CSS, mobile-first layout                                      |
| Database   | [Neon](https://neon.tech/) serverless Postgres via `@neondatabase/serverless` |
| Hosting    | [Vercel](https://vercel.com/), using the Neon integration for `DATABASE_URL` |

## Data model

One row per room per day holds the current state, and a log table keeps every action.

```sql
-- Current state: one row per room per day (seeded for G01–G21 × 13–18 Oct)
CREATE TABLE room_day (
  room_code   text        NOT NULL CHECK (room_code ~ '^G(0[1-9]|1[0-9]|2[01])$'),
  work_date   date        NOT NULL,
  placed_by   text,
  placed_at   timestamptz,
  picked_by   text,
  picked_at   timestamptz,
  note        text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_code, work_date),
  CHECK (picked_at IS NULL OR placed_at IS NOT NULL)  -- can't pick up before placing
);

-- Audit trail: every place / pick-up / undo / note
CREATE TABLE activity_log (
  id          bigserial   PRIMARY KEY,
  room_code   text        NOT NULL,
  work_date   date        NOT NULL,
  action      text        NOT NULL CHECK (action IN ('place', 'pickup', 'undo_place', 'undo_pickup', 'note')),
  actor       text        NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

The status comes from the timestamps: no `placed_at` means **Pending**, `placed_at` without `picked_at` means **Placed**, and both together mean **Picked up**.

To block double work, updates are conditional, so the database decides who was first:

```sql
UPDATE room_day
SET placed_by = $actor, placed_at = now(), updated_at = now()
WHERE room_code = $room AND work_date = $date AND placed_at IS NULL
RETURNING *;
-- 0 rows returned => someone else already placed it; show who and when
```

## Configuration

Create `.env.local` for local development. On Vercel, set the same values in *Project Settings → Environment Variables*.

```bash
# Set automatically when Neon is connected through the Vercel integration
DATABASE_URL="postgres://USER:PASSWORD@HOST/DB?sslmode=require"

# The 3 names shown in the "Who are you?" dropdown (comma-separated)
NEXT_PUBLIC_TEAM_MEMBERS="Person A,Person B,Person C"

# Working period and rooms
NEXT_PUBLIC_START_DATE="2026-10-13"
NEXT_PUBLIC_END_DATE="2026-10-18"
NEXT_PUBLIC_ROOM_PREFIX="G"
NEXT_PUBLIC_ROOM_COUNT="21"

# Used to decide what "today" is and to display times
NEXT_PUBLIC_TIMEZONE="Asia/Bangkok"
```

## Getting started (local)

```bash
# 1. Install dependencies
npm install

# 2. Add your environment variables
cp .env.example .env.local   # then fill in DATABASE_URL and names

# 3. Create the tables and seed G01–G21 for every day in the range
npm run db:migrate
npm run db:seed

# 4. Start the dev server
npm run dev
```

Open http://localhost:3000. To try it on a phone on the same Wi-Fi, use your computer's local IP address instead of `localhost`.

## Deploying to Vercel + Neon

1. Push this repo to GitHub.
2. In Vercel, **Add New → Project** and import the repo.
3. In the project, go to **Storage → Connect Database → Neon** and create or attach a database. Vercel adds `DATABASE_URL` for you.
4. Add the other `NEXT_PUBLIC_*` variables listed above.
5. Deploy, then run the migration and seed once against the production database (locally with the production `DATABASE_URL`, or in the Neon SQL editor).
6. Share the URL with the team. On each phone, use **Add to Home Screen** so it opens like an app.

## Planned project structure

```
app/
  layout.tsx              # shell, header with name picker and date switcher
  page.tsx                # room grid for the selected day
  actions.ts              # server actions: place, pickup, undo, note
  api/rooms/route.ts      # JSON feed used for auto-refresh
components/
  NamePicker.tsx          # "Who are you?" dropdown (saved in localStorage)
  DatePicker.tsx          # 13–18 Oct day switcher
  RoomGrid.tsx            # G01–G21 cards with status colours
  RoomSheet.tsx           # bottom sheet: actions, note, history
  ProgressBar.tsx         # placed / picked-up counters and filters
lib/
  db.ts                   # Neon client
  rooms.ts                # room list and date range helpers
db/
  schema.sql
  seed.ts
```

## Security note

There is no authentication by design, because only 3 trusted people use the app for 6 days. Anyone with the URL can view and change statuses, so:

- Keep the URL private. A non-obvious Vercel project name helps.
- Optionally, turn on Vercel's **Password Protection / Deployment Protection**, or add a single shared passcode, if the link might spread.
- The activity log means any wrong change can be traced and undone.

## Roadmap / nice-to-have

- [ ] Export a day's records (or the whole period) to CSV
- [ ] Per-person counters ("who did how many rooms")
- [ ] Room map view matching the physical layout of the hall
- [ ] Offline queue for spots with weak signal, syncing when back online
