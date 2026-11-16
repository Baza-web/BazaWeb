"use client";

import { useRef, useState, useTransition } from "react";
import { previewImport, applyImport, discardImportBatch, type ImportEntity } from "@/app/(app)/import/actions";
import { FileDropInput } from "@/components/FileDropInput";

type DiffRow = {
  id: string;
  label: string;
  changes: { field: string; label: string; from: string; to: string }[];
  errors: string[];
};

export function ImportWizard({ googleClientId, googlePickerApiKey }: { googleClientId?: string; googlePickerApiKey?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [entityType, setEntityType] = useState<ImportEntity>("CUSTOMER");
  const [isPending, startTransition] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [batchId, setBatchId] = useState<string | null>(null);
  const [rows, setRows] = useState<DiffRow[]>([]);
  const [matched, setMatched] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  function reset() {
    setBatchId(null);
    setRows([]);
    setSelected(new Set());
    setApplyResult(null);
    if (fileRef.current) fileRef.current.value = "";
    setResetKey((k) => k + 1);
  }

  function handlePreview() {
    setUploadError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setUploadError("Choose a .xlsx file first — export one from Customers or Inventory, edit it, then upload it here.");
      return;
    }
    const fd = new FormData();
    fd.set("file", file);

    startTransition(async () => {
      try {
        const result = await previewImport(entityType, fd);
        if (result.rows.length === 0) {
          setUploadError(
            result.matched === 0
              ? "No matching rows found in that file."
              : "No changes found — every row already matches what's in the system.",
          );
          return;
        }
        setBatchId(result.batchId);
        setRows(result.rows);
        setSelected(new Set(result.rows.filter((r) => r.errors.length === 0).map((r) => r.id)));
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Couldn't read that file.");
      }
    });
  }

  function handleApply() {
    if (!batchId) return;
    startTransition(async () => {
      const result = await applyImport(batchId, Array.from(selected));
      setApplyResult(`Applied ${result.applied} row${result.applied === 1 ? "" : "s"}.`);
      setBatchId(null);
      setRows([]);
      setSelected(new Set());
      if (fileRef.current) fileRef.current.value = "";
      setResetKey((k) => k + 1);
    });
  }

  function handleDiscard() {
    if (batchId) startTransition(() => discardImportBatch(batchId));
    reset();
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (rows.length > 0) {
    const selectableCount = rows.filter((r) => r.errors.length === 0).length;
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-stone-600">
            {rows.length} row{rows.length === 1 ? "" : "s"} with changes found ({selected.size} of {selectableCount} selected)
          </p>
          <button type="button" onClick={handleDiscard} className="btn-secondary text-xs">
            Cancel
          </button>
        </div>

        <div className="max-h-[28rem] space-y-2 overflow-y-auto">
          {rows.map((row) => {
            const hasError = row.errors.length > 0;
            return (
              <div
                key={row.id}
                className={`rounded-lg border p-3 text-sm ${hasError ? "border-red-200 bg-red-50/60" : "border-stone-200"}`}
              >
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-stone-300"
                    checked={selected.has(row.id)}
                    disabled={hasError}
                    onChange={() => toggleRow(row.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900">{row.label}</p>
                    {row.changes.map((c) => (
                      <p key={c.field} className="text-xs text-stone-600">
                        <span className="text-stone-400">{c.label}:</span> {c.from} → <span className="font-medium text-brand-700">{c.to}</span>
                      </p>
                    ))}
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
          {isPending ? "Applying…" : `Apply ${selected.size} change${selected.size === 1 ? "" : "s"}`}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label">What are you updating?</label>
        <select
          className="input"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value as ImportEntity)}
        >
          <option value="CUSTOMER">Customers</option>
          <option value="INVENTORY">Inventory</option>
        </select>
      </div>
      <div>
        <label className="label">Edited .xlsx file</label>
        <FileDropInput
          key={resetKey}
          ref={fileRef}
          name="file"
          accept=".xlsx"
          googleClientId={googleClientId}
          googlePickerApiKey={googlePickerApiKey}
        />
        <p className="mt-1 text-xs text-stone-400">
          Export {entityType === "CUSTOMER" ? "Customers" : "Inventory"} to Excel first, edit the values you want to change,
          then upload the same file here — leave a cell blank to leave that field unchanged.
        </p>
      </div>
      {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
      {applyResult && <p className="text-xs text-green-700">{applyResult}</p>}
      <button type="button" onClick={handlePreview} disabled={isPending} className="btn-primary">
        {isPending ? "Reading…" : "Preview changes"}
      </button>
    </div>
  );
}
