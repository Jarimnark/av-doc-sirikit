"use client";

type Props = {
  members: string[];
  value: string | null;
  onChange: (name: string) => void;
};

/**
 * Full-screen "who are you?" chooser. Shown until a name has been picked;
 * the choice is kept in localStorage by the parent.
 */
export default function NamePicker({ members, value, onChange }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-900/60 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-semibold">คุณคือใคร?</h2>
        <p className="mt-1 text-sm text-zinc-600">
          เลือกชื่อของคุณ ระบบจะจำไว้ในเครื่องนี้ และเปลี่ยนได้ทีหลังที่มุมบนขวา
        </p>
        <div className="mt-5 grid gap-3">
          {members.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onChange(name)}
              className={`rounded-xl border px-4 py-4 text-lg font-medium transition active:scale-[0.98] ${
                value === name
                  ? "border-blue-600 bg-blue-50 text-blue-800"
                  : "border-zinc-200 bg-white hover:bg-zinc-50"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
