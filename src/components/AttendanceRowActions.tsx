"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAttendanceLog, deleteAttendanceLog } from "@/app/(app)/attendance/actions";

function toLocalInputValue(d: Date | null) {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AttendanceRowActions({
  logId,
  clockInAt,
  clockOutAt,
}: {
  logId: string;
  clockInAt: Date;
  clockOutAt: Date | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await updateAttendanceLog(logId, formData);
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save that change.");
      }
    });
  }

  function handleDelete() {
    if (!confirm("Delete this attendance record? This can't be undone.")) return;
    startTransition(async () => {
      await deleteAttendanceLog(logId);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-brand-700 hover:underline">
          Edit
        </button>
        <button type="button" onClick={handleDelete} disabled={pending} className="text-xs text-red-600 hover:underline disabled:opacity-50">
          Delete
        </button>
      </div>
    );
  }

  return (
    <form action={handleSave} className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-2">
      <div>
        <label className="label">Clock in</label>
        <input
          type="datetime-local"
          name="clockInAt"
          required
          defaultValue={toLocalInputValue(clockInAt)}
          className="input text-xs"
        />
      </div>
      <div>
        <label className="label">Clock out</label>
        <input
          type="datetime-local"
          name="clockOutAt"
          defaultValue={toLocalInputValue(clockOutAt)}
          className="input text-xs"
        />
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary px-2 py-1 text-xs disabled:opacity-50">
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="btn-secondary px-2 py-1 text-xs">
          Cancel
        </button>
      </div>
    </form>
  );
}
