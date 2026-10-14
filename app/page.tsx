import { connection } from "next/server";
import { Suspense } from "react";
import Board from "@/components/Board";
import { TEAM_MEMBERS, TIMEZONE } from "@/lib/config";
import {
  formatDayLabel,
  formatWeekday,
  resolveDate,
  todayInZone,
  workingDates,
} from "@/lib/dates";
import {
  getDayNotes,
  getLogForDate,
  getPhotosForDate,
  getRoomsForDate,
} from "@/lib/rooms";

export default function Page(props: PageProps<"/">) {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <BoardLoader searchParams={props.searchParams} />
    </Suspense>
  );
}

async function BoardLoader({
  searchParams,
}: {
  searchParams: PageProps<"/">["searchParams"];
}) {
  // Everything below depends on the request (date, "today", live DB state),
  // so stop prerendering here.
  await connection();
  const params = await searchParams;
  const requested = typeof params.date === "string" ? params.date : undefined;
  const date = resolveDate(requested);

  const [rooms, log, photos, dayNotes] = await Promise.all([
    getRoomsForDate(date),
    getLogForDate(date),
    getPhotosForDate(date),
    getDayNotes(date),
  ]);

  const dates = workingDates().map((value) => ({
    value,
    label: formatDayLabel(value),
    weekday: formatWeekday(value),
  }));

  return (
    <Board
      date={date}
      today={todayInZone()}
      dates={dates}
      rooms={rooms}
      log={log}
      photos={photos}
      dayNotes={dayNotes}
      members={[...TEAM_MEMBERS]}
      timezone={TIMEZONE}
    />
  );
}

function BoardSkeleton() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-4">
      <div className="h-10 w-48 animate-pulse rounded-lg bg-zinc-200" />
      <div className="mt-4 h-12 animate-pulse rounded-xl bg-zinc-200" />
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-7">
        {Array.from({ length: 21 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-200" />
        ))}
      </div>
    </main>
  );
}
