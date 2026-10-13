"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold">โหลดข้อมูลไม่สำเร็จ</h1>
      <p className="mt-2 text-sm text-zinc-600">
        เชื่อมต่อฐานข้อมูลไม่ได้หรือเครือข่ายขัดข้อง ลองอีกครั้งได้เลย
      </p>
      {process.env.NODE_ENV !== "production" && (
        <pre className="mt-3 max-w-full overflow-x-auto rounded-lg bg-zinc-100 p-3 text-left text-xs text-red-700">
          {error.message}
        </pre>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white"
      >
        ลองใหม่
      </button>
    </main>
  );
}
