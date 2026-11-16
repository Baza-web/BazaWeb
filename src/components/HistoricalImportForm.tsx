"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importHistoricalTotalsAction } from "@/app/(app)/accounting/import-history/actions";
import { FileDropInput } from "@/components/FileDropInput";
import type { HistoricalImportResult } from "@/lib/historicalImport";

export function HistoricalImportForm({
  branches,
  googleClientId,
  googlePickerApiKey,
}: {
  branches: { id: string; name: string }[];
  googleClientId?: string;
  googlePickerApiKey?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<(HistoricalImportResult & { error?: string }) | null>(null);
  const [resetKey, setResetKey] = useState(0);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setResult(null);
    startTransition(async () => {
      const outcome = await importHistoricalTotalsAction(fd);
      setResult(outcome);
      if (outcome.monthsPosted.length > 0) {
        formRef.current?.reset();
        setResetKey((k) => k + 1);
        router.refresh();
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="card space-y-4">
      <div>
        <h2 className="font-medium">Import historical monthly totals</h2>
        <p className="mt-1 text-sm text-stone-500">
          One row per account per month. Needs a <strong>Month</strong> column (e.g. &quot;2026-01&quot; or &quot;January
          2026&quot;), an <strong>Account</strong> column (code or name), and <strong>Debit</strong>/<strong>Credit</strong>{" "}
          columns. Every month posts as one balanced journal entry dated the last day of that month — any month already
          imported is skipped, never double-posted.
        </p>
      </div>

      {branches.length > 1 && (
        <div className="max-w-xs">
          <label className="label">Branch</label>
          <select className="input" name="branchId" defaultValue="">
            <option value="">Company-wide</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="label">File</label>
        <FileDropInput
          key={resetKey}
          name="file"
          accept=".xlsx,.csv"
          required
          googleClientId={googleClientId}
          googlePickerApiKey={googlePickerApiKey}
        />
      </div>

      <button type="submit" disabled={isPending} className="btn-primary">
        {isPending ? "Importing…" : "Import"}
      </button>

      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}

      {result && !result.error && (
        <div className="space-y-2 text-sm">
          {result.monthsPosted.length > 0 && (
            <div className="rounded-lg bg-green-50 px-3 py-2 text-green-700">
              <p className="font-medium">Posted {result.monthsPosted.length} month(s):</p>
              <ul className="mt-1 list-inside list-disc">
                {result.monthsPosted.map((m) => (
                  <li key={m.monthKey}>
                    {m.monthLabel} — {m.entryNumber}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.monthsSkipped.length > 0 && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
              <p className="font-medium">Skipped {result.monthsSkipped.length} month(s):</p>
              <ul className="mt-1 list-inside list-disc">
                {result.monthsSkipped.map((m) => (
                  <li key={m.monthKey}>
                    {m.monthLabel} — {m.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.rowErrors.length > 0 && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
              <p className="font-medium">{result.rowErrors.length} row(s) couldn&apos;t be matched to an account:</p>
              <ul className="mt-1 list-inside list-disc">
                {result.rowErrors.slice(0, 20).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
              {result.rowErrors.length > 20 && <p className="mt-1 text-xs">…and {result.rowErrors.length - 20} more.</p>}
            </div>
          )}
        </div>
      )}
    </form>
  );
}
