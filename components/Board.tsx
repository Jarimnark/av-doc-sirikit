"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  pickupDocument,
  placeDocument,
  saveNote,
  undoPickup,
  undoPlace,
  type ActionResult,
} from "@/app/actions";
import type { LogView, RoomStatus, RoomView } from "@/lib/rooms";
import NamePicker from "./NamePicker";

const ACTOR_KEY = "avdoc.actor";
const REFRESH_MS = 7000;

// Tiny localStorage-backed store for "who is using this phone", exposed via
// useSyncExternalStore so the server render (no name yet) and the client
// render stay consistent without a setState-in-effect.
const actorListeners = new Set<() => void>();
function subscribeActor(cb: () => void) {
  actorListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    actorListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readActor(): string | null {
  try {
    return window.localStorage.getItem(ACTOR_KEY);
  } catch {
    return null;
  }
}
function writeActor(name: string) {
  try {
    window.localStorage.setItem(ACTOR_KEY, name);
  } catch {
    /* private mode etc. – the picker will show again next visit */
  }
  actorListeners.forEach((cb) => cb());
}
/** Current wall-clock time in the working timezone as "HH:MM" (for <input type="time">). */
function nowHHMM(timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

const serverSnapshot = () => null;
const hydratedSnapshot = () => true;
const notHydratedSnapshot = () => false;

type DateTab = { value: string; label: string; weekday: string };

type Props = {
  date: string;
  today: string;
  dates: DateTab[];
  rooms: RoomView[];
  log: LogView[];
  members: string[];
  timezone: string;
};

type Filter = "all" | RoomStatus;

const STATUS_LABEL: Record<RoomStatus, string> = {
  pending: "รอวาง",
  placed: "วางแล้ว",
  picked: "เก็บแล้ว",
};

const STATUS_CARD: Record<RoomStatus, string> = {
  pending: "border-zinc-200 bg-white text-zinc-700",
  placed: "border-amber-300 bg-amber-50 text-amber-900",
  picked: "border-emerald-300 bg-emerald-50 text-emerald-900",
};

const STATUS_CHIP: Record<RoomStatus, string> = {
  pending: "bg-zinc-100 text-zinc-600",
  placed: "bg-amber-200 text-amber-900",
  picked: "bg-emerald-200 text-emerald-900",
};

const ACTION_LABEL: Record<LogView["action"], string> = {
  place: "วางเอกสาร",
  pickup: "เก็บเอกสาร",
  undo_place: "ยกเลิกการวาง",
  undo_pickup: "ยกเลิกการเก็บ",
  note: "บันทึกโน้ต",
};

export default function Board({ date, today, dates, rooms, log, members, timezone }: Props) {
  const router = useRouter();
  const storedActor = useSyncExternalStore(subscribeActor, readActor, serverSnapshot);
  const actor = storedActor && members.includes(storedActor) ? storedActor : null;
  const actorReady = useSyncExternalStore(subscribeActor, hydratedSnapshot, notHydratedSnapshot);
  const [choosingName, setChoosingName] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const chooseActor = useCallback((name: string) => {
    writeActor(name);
    setChoosingName(false);
  }, []);

  // Keep everyone looking at the same picture: refresh on an interval and
  // whenever the tab comes back to the foreground.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setLastRefresh(
        new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      );
    };
    const id = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [router]);

  // Auto-hide toasts.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const counts = useMemo(() => {
    const c = { pending: 0, placed: 0, picked: 0 };
    for (const r of rooms) c[r.status] += 1;
    return c;
  }, [rooms]);

  const perPerson = useMemo(() => {
    const tally = new Map<string, { placed: number; picked: number }>();
    for (const m of members) tally.set(m, { placed: 0, picked: 0 });
    for (const r of rooms) {
      if (r.placedBy) {
        const t = tally.get(r.placedBy) ?? { placed: 0, picked: 0 };
        t.placed += 1;
        tally.set(r.placedBy, t);
      }
      if (r.pickedBy) {
        const t = tally.get(r.pickedBy) ?? { placed: 0, picked: 0 };
        t.picked += 1;
        tally.set(r.pickedBy, t);
      }
    }
    return [...tally.entries()];
  }, [rooms, members]);

  const visibleRooms = filter === "all" ? rooms : rooms.filter((r) => r.status === filter);
  const selectedRoom = selected ? rooms.find((r) => r.code === selected) ?? null : null;
  const selectedLog = selected ? log.filter((l) => l.room === selected) : [];

  const run = useCallback(
    (
      fn: (input: {
        room: string;
        date: string;
        actor: string;
        at?: string | null;
      }) => Promise<ActionResult>,
      room: string,
      successText: string,
      at: string | null = null,
    ) => {
      if (!actor) {
        setChoosingName(true);
        return;
      }
      startTransition(async () => {
        const result = await fn({ room, date, actor, at });
        if (result.ok) setToast({ text: successText, kind: "ok" });
        else setToast({ text: result.message, kind: "error" });
        router.refresh();
      });
    },
    [actor, date, router],
  );

  const submitNote = useCallback(
    (room: string, note: string) => {
      if (!actor) {
        setChoosingName(true);
        return;
      }
      startTransition(async () => {
        const result = await saveNote({ room, date, actor, note });
        setToast(
          result.ok
            ? { text: "บันทึกโน้ตแล้ว", kind: "ok" }
            : { text: result.message, kind: "error" },
        );
        router.refresh();
      });
    },
    [actor, date, router],
  );

  const total = rooms.length;
  const placedOrMore = counts.placed + counts.picked;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-24 pt-3">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold leading-tight">เอกสารห้อง G01–G22</h1>
          <p className="text-xs text-zinc-500">
            {lastRefresh ? `อัปเดตล่าสุด ${lastRefresh}` : "อัปเดตอัตโนมัติทุก 7 วินาที"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setChoosingName(true)}
          className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium shadow-sm"
        >
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-600" />
          {actor ?? "เลือกชื่อ"}
        </button>
      </header>

      {/* Date tabs */}
      <nav className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {dates.map((d) => {
          const active = d.value === date;
          const isToday = d.value === today;
          return (
            <Link
              key={d.value}
              href={`/?date=${d.value}`}
              onClick={() => setSelected(null)}
              className={`flex shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-sm leading-tight ${
                active
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-zinc-200 bg-white text-zinc-700"
              }`}
            >
              <span className={`text-[11px] ${active ? "text-blue-100" : "text-zinc-500"}`}>
                {isToday ? "วันนี้" : d.weekday}
              </span>
              <span className="font-semibold">{d.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Progress */}
      <section className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex items-baseline justify-between text-sm">
          <span>
            วางแล้ว <b>{placedOrMore}</b>/{total}
          </span>
          <span>
            เก็บแล้ว <b>{counts.picked}</b>/{total}
          </span>
        </div>
        <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-zinc-100">
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${(counts.picked / total) * 100}%` }}
          />
          <div
            className="bg-amber-400 transition-all"
            style={{ width: `${(counts.placed / total) * 100}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(
            [
              ["all", "ทั้งหมด", total],
              ["pending", "รอวาง", counts.pending],
              ["placed", "รอเก็บ", counts.placed],
              ["picked", "เสร็จแล้ว", counts.picked],
            ] as [Filter, string, number][]
          ).map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === key ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"
              }`}
            >
              {label} {n}
            </button>
          ))}
        </div>
      </section>

      {/* Room grid */}
      <section className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-7">
        {visibleRooms.map((room) => (
          <button
            key={room.code}
            type="button"
            onClick={() => setSelected(room.code)}
            className={`flex min-h-24 flex-col items-start rounded-xl border p-2.5 text-left shadow-sm transition active:scale-[0.97] ${STATUS_CARD[room.status]}`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-base font-bold tracking-wide">{room.code}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CHIP[room.status]}`}>
                {STATUS_LABEL[room.status]}
              </span>
            </div>
            <div className="mt-1.5 space-y-0.5 text-[11px] leading-tight">
              {room.placedBy && (
                <div className="truncate">
                  วาง · {room.placedBy} {room.placedAt}
                </div>
              )}
              {room.pickedBy && (
                <div className="truncate">
                  เก็บ · {room.pickedBy} {room.pickedAt}
                </div>
              )}
              {room.note && <div className="truncate italic opacity-80">✎ {room.note}</div>}
            </div>
          </button>
        ))}
        {visibleRooms.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-zinc-500">ไม่มีห้องในหมวดนี้</p>
        )}
      </section>

      {/* Per-person tally */}
      <section className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        {perPerson.map(([name, t]) => (
          <div key={name} className="rounded-xl border border-zinc-200 bg-white p-2">
            <div className="font-semibold">{name}</div>
            <div className="text-zinc-600">
              วาง {t.placed} · เก็บ {t.picked}
            </div>
          </div>
        ))}
      </section>

      {/* Room sheet */}
      {selectedRoom && (
        <RoomSheet
          room={selectedRoom}
          log={selectedLog}
          busy={isPending}
          timezone={timezone}
          onClose={() => setSelected(null)}
          onPlace={(at) =>
            run(placeDocument, selectedRoom.code, `วางเอกสารห้อง ${selectedRoom.code} แล้ว`, at)
          }
          onPickup={(at) =>
            run(pickupDocument, selectedRoom.code, `เก็บเอกสารห้อง ${selectedRoom.code} แล้ว`, at)
          }
          onUndoPlace={() => run(undoPlace, selectedRoom.code, `ยกเลิกการวางห้อง ${selectedRoom.code}`)}
          onUndoPickup={() => run(undoPickup, selectedRoom.code, `ยกเลิกการเก็บห้อง ${selectedRoom.code}`)}
          onSaveNote={(note) => submitNote(selectedRoom.code, note)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
            toast.kind === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Name picker */}
      {actorReady && (actor === null || choosingName) && (
        <NamePicker members={members} value={actor} onChange={chooseActor} />
      )}
    </main>
  );
}

type SheetProps = {
  room: RoomView;
  log: LogView[];
  busy: boolean;
  timezone: string;
  onClose: () => void;
  onPlace: (at: string | null) => void;
  onPickup: (at: string | null) => void;
  onUndoPlace: () => void;
  onUndoPickup: () => void;
  onSaveNote: (note: string) => void;
};

function RoomSheet({
  room,
  log,
  busy,
  timezone,
  onClose,
  onPlace,
  onPickup,
  onUndoPlace,
  onUndoPickup,
  onSaveNote,
}: SheetProps) {
  // When the action happened: right now (default) or a time the user picks,
  // e.g. they placed the document at 09:30 but only record it at 10:00.
  const [timeMode, setTimeMode] = useState<"now" | "custom">("now");
  const [customTime, setCustomTime] = useState(() => nowHHMM(timezone));
  const at = timeMode === "custom" ? customTime : null;
  const canAct = timeMode === "now" || /^\d{2}:\d{2}$/.test(customTime);
  const timeSuffix = at ? ` · ${at}` : "";
  // `draft` is only set while the user is typing; otherwise the field shows
  // whatever the server has, so other people's edits come through.
  const [draft, setDraft] = useState<string | null>(null);
  const serverNote = room.note ?? "";
  const note = draft ?? serverNote;

  const primary =
    "flex-1 rounded-xl px-4 py-3.5 text-base font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50";
  const secondary =
    "rounded-xl border border-zinc-300 bg-white px-4 py-3.5 text-sm font-medium text-zinc-700 transition active:scale-[0.98] disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="ปิด" onClick={onClose} className="absolute inset-0 bg-zinc-900/50" />
      <div className="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">{room.code}</h2>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CHIP[room.status]}`}>
              {STATUS_LABEL[room.status]}
            </span>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100" aria-label="ปิด">
            ✕
          </button>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-zinc-50 p-2">
            <dt className="text-xs text-zinc-500">วางโดย</dt>
            <dd className="font-medium">
              {room.placedBy ? `${room.placedBy} · ${room.placedAt}` : "—"}
            </dd>
          </div>
          <div className="rounded-lg bg-zinc-50 p-2">
            <dt className="text-xs text-zinc-500">เก็บโดย</dt>
            <dd className="font-medium">
              {room.pickedBy ? `${room.pickedBy} · ${room.pickedAt}` : "—"}
            </dd>
          </div>
        </dl>

        {room.status !== "picked" && (
          <fieldset className="mt-4">
            <legend className="text-xs font-medium text-zinc-500">เวลาที่ทำ</legend>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex rounded-lg bg-zinc-100 p-0.5 text-sm">
                <button
                  type="button"
                  onClick={() => setTimeMode("now")}
                  className={`rounded-md px-3 py-1.5 font-medium ${
                    timeMode === "now" ? "bg-white shadow-sm" : "text-zinc-600"
                  }`}
                >
                  ตอนนี้
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTimeMode("custom");
                    setCustomTime(nowHHMM(timezone));
                  }}
                  className={`rounded-md px-3 py-1.5 font-medium ${
                    timeMode === "custom" ? "bg-white shadow-sm" : "text-zinc-600"
                  }`}
                >
                  ระบุเวลา
                </button>
              </div>
              {timeMode === "custom" && (
                <input
                  type="time"
                  aria-label="เวลาที่ทำ"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  required
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-base tabular-nums"
                />
              )}
            </div>
          </fieldset>
        )}

        <div className="mt-3 flex gap-2">
          {room.status === "pending" && (
            <button
              type="button"
              disabled={busy || !canAct}
              onClick={() => onPlace(at)}
              className={`${primary} bg-amber-500`}
            >
              วางเอกสารแล้ว{timeSuffix}
            </button>
          )}
          {room.status === "placed" && (
            <>
              <button
                type="button"
                disabled={busy || !canAct}
                onClick={() => onPickup(at)}
                className={`${primary} bg-emerald-600`}
              >
                เก็บเอกสารแล้ว{timeSuffix}
              </button>
              <button type="button" disabled={busy} onClick={onUndoPlace} className={secondary}>
                ยกเลิกการวาง
              </button>
            </>
          )}
          {room.status === "picked" && (
            <button type="button" disabled={busy} onClick={onUndoPickup} className={`${secondary} flex-1`}>
              ยกเลิกการเก็บ (กลับเป็น “วางแล้ว”)
            </button>
          )}
        </div>

        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSaveNote(note);
            setDraft(null);
          }}
        >
          <label className="text-xs font-medium text-zinc-500" htmlFor="note">
            โน้ต (เช่น ห้องล็อก, ฝากไว้กับเจ้าหน้าที่)
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="note"
              value={note}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
              className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              placeholder="ไม่มีโน้ต"
            />
            <button type="submit" disabled={busy || note === serverNote} className={secondary}>
              บันทึก
            </button>
          </div>
        </form>

        <section className="mt-4">
          <h3 className="text-xs font-medium text-zinc-500">ประวัติวันนี้</h3>
          {log.length === 0 ? (
            <p className="mt-1 text-sm text-zinc-400">ยังไม่มีการเปลี่ยนแปลง</p>
          ) : (
            <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-sm">
              {log.map((l) => (
                <li key={l.id} className="flex gap-2">
                  <span className="w-12 shrink-0 tabular-nums text-zinc-500">{l.time}</span>
                  <span>
                    <b>{l.actor}</b> {ACTION_LABEL[l.action]}
                    {l.action === "note"
                      ? l.note
                        ? `: ${l.note}`
                        : " (ลบโน้ต)"
                      : l.note
                        ? ` (${l.note})`
                        : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
