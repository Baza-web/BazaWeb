"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileDropInput } from "@/components/FileDropInput";

type Row = { rowNumber: number; label: string; errors: string[] };

const MAX_ROWS_SHOWN = 200;

export function BulkCreatePanel<R extends Row>({
  templateHref,
  previewAction,
  applyAction,
  discardAction,
  entitySingular,
  entityPlural,
  googleClientId,
  googlePickerApiKey,
}: {
  templateHref: string;
  previewAction: (formData: FormData) => Promise<{ batchId: string | null; rows: R[] }>;
  applyAction: (batchId: string, rowNumbers: number[]) => Promise<{ created: number }>;
  discardAction: (batchId: string) => Promise<void>;
  entitySingular: string;
  entityPlural: string;
  googleClientId?: string;
  googlePickerApiKey?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [rows, setRows] = useState<R[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  function reset() {
    setBatchId(null);
    setRows([]);
    setSelected(new Set());
    if (fileRef.current) fileRef.current.value = "";
    setResetKey((k) => k + 1);
  }

  function handlePreview() {
    setUploadError(null);
    setApplyResult(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setUploadError(`Choose a .xlsx file first — download the template below, fill it in, then upload it here.`);
      return;
    }
    const fd = new FormData();
    fd.set("file", file);

    startTransition(async () => {
      try {
        const result = await previewAction(fd);
        if (result.rows.length === 0) {
          setUploadError("No rows found in that file.");
          return;
        }
        setBatchId(result.batchId);
        setRows(result.rows);
        setSelected(new Set(result.rows.filter((r) => r.errors.length === 0).map((r) => r.rowNumber)));
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Couldn't read that file.");
      }
    });
  }

  function handleApply() {
    if (!batchId) return;
    startTransition(async () => {
      const result = await applyAction(batchId, Array.from(selected));
      setApplyResult(`Created ${result.created} ${result.created === 1 ? entitySingular : entityPlural}.`);
      reset();
      router.refresh();
    });
  }

  function handleDiscard() {
    if (batchId) startTransition(() => discardAction(batchId));
    reset();
  }

  function toggleRow(rowNumber: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  if (rows.length > 0) {
    const readyCount = rows.filter((r) => r.errors.length === 0).length;
    const errorCount = rows.length - readyCount;
    const shown = rows.slice(0, MAX_ROWS_SHOWN);
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-stone-600">
            {readyCount} {readyCount === 1 ? entitySingular : entityPlural} ready to create
            {errorCount > 0 && `, ${errorCount} row${errorCount === 1 ? "" : "s"} with errors`} ({selected.size} selected)
          </p>
          <button type="button" onClick={handleDiscard} className="btn-secondary text-xs">
            Cancel
          </button>
        </div>
        {rows.length > MAX_ROWS_SHOWN && (
          <p className="text-xs text-stone-400">
            Showing the first {MAX_ROWS_SHOWN} of {rows.length} rows — the rest are included when you create, just not listed here.
          </p>
        )}

        <div className="max-h-[28rem] space-y-2 overflow-y-auto">
          {shown.map((row) => {
            const hasError = row.errors.length > 0;
            return (
              <div
                key={row.rowNumber}
                className={`rounded-lg border p-3 text-sm ${hasError ? "border-red-200 bg-red-50/60" : "border-stone-200"}`}
              >
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-stone-300"
                    checked={selected.has(row.rowNumber)}
                    disabled={hasError}
                    onChange={() => toggleRow(row.rowNumber)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900">{row.label}</p>
                    {row.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-600">
                        {e}
                      </p>
                    ))}
                  </div>
                </label>
              </div>
            );
          })}
        </div>

        <button type="button" onClick={handleApply} disabled={isPending || selected.size === 0} className="btn-primary">
          {isPending ? "Creating…" : `Create ${selected.size} ${selected.size === 1 ? entitySingular : entityPlural}`}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <a href={templateHref} className="btn-secondary inline-flex w-fit text-xs">
        Download template
      </a>
      <div>
        <label className="label">Filled-in .xlsx file</label>
        <FileDropInput
          key={resetKey}
          ref={fileRef}
          name="file"
          accept=".xlsx"
          googleClientId={googleClientId}
          googlePickerApiKey={googlePickerApiKey}
        />
        <p className="mt-1 text-xs text-stone-400">
          Download the template above, add one row per new {entitySingular}, then upload it here.
        </p>
      </div>
      {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
      {applyResult && <p className="text-xs text-green-700">{applyResult}</p>}
      <button type="button" onClick={handlePreview} disabled={isPending} className="btn-primary">
        {isPending ? "Reading…" : "Preview"}
      </button>
    </div>
  );
}
