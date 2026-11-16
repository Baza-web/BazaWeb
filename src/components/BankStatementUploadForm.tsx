"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadBankStatement } from "@/app/(app)/accounting/bank-reconciliation/actions";

export function BankStatementUploadForm({ accounts }: { accounts: { id: string; code: string; name: string }[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ imported: number; skipped: number; error?: string } | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setResult(null);
    startTransition(async () => {
      const outcome = await uploadBankStatement(fd);
      setResult(outcome);
      if (!outcome.error) {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="card space-y-3 print:hidden">
      <h2 className="font-medium">Upload bank statement</h2>
      <p className="text-sm text-stone-500">
        A .xlsx or .csv export from your bank, with Date, Description, and either an Amount column or Debit/Credit columns.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Account</label>
          <select className="input" name="accountId" required>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">File</label>
          <input className="input text-xs" type="file" name="file" accept=".xlsx,.csv" required />
        </div>
      </div>
      <button type="submit" disabled={isPending} className="btn-primary">
        {isPending ? "Uploading…" : "Upload"}
      </button>
      {result && !result.error && (
        <p className="text-sm text-green-700">
          Imported {result.imported} line{result.imported === 1 ? "" : "s"}
          {result.skipped > 0 ? ` (${result.skipped} already on file, skipped)` : ""}.
        </p>
      )}
      {result?.error && <p className="text-sm text-red-600">{result.error}</p>}
    </form>
  );
}
