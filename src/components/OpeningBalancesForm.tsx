"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postOpeningBalances } from "@/app/(app)/accounting/setup/actions";

export function OpeningBalancesForm({ defaultDate, disabled }: { defaultDate: string; disabled: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ status: "posted" | "error"; message?: string } | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMessage(null);
    startTransition(async () => {
      const result = await postOpeningBalances(fd);
      setMessage(result);
      if (result.status === "posted") {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  if (disabled) {
    return (
      <p className="text-sm text-stone-500">
        Opening balances were already posted. Reverse that entry from{" "}
        <a href="/accounting/journal-entries" className="text-brand-700 hover:underline">
          Journal Entries
        </a>{" "}
        first if it needs redoing.
      </p>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="label">As of</label>
        <input className="input max-w-[180px]" type="date" name="date" defaultValue={defaultDate} required />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Cash</label>
          <input className="input" type="number" step="0.01" min="0" name="cash" defaultValue={0} />
        </div>
        <div>
          <label className="label">Bank</label>
          <input className="input" type="number" step="0.01" min="0" name="bank" defaultValue={0} />
        </div>
        <div>
          <label className="label">Accounts Receivable</label>
          <input className="input" type="number" step="0.01" min="0" name="accountsReceivable" defaultValue={0} />
        </div>
        <div>
          <label className="label">Inventory value</label>
          <input className="input" type="number" step="0.01" min="0" name="inventory" defaultValue={0} />
        </div>
        <div>
          <label className="label">Accounts Payable</label>
          <input className="input" type="number" step="0.01" min="0" name="accountsPayable" defaultValue={0} />
        </div>
      </div>
      <p className="text-xs text-stone-500">
        Owner&apos;s Capital is filled in automatically so this always balances — you don&apos;t need to work that out.
      </p>
      <button type="submit" disabled={isPending} className="btn-primary">
        {isPending ? "Posting…" : "Post opening balances"}
      </button>
      {message?.status === "posted" && <p className="text-sm text-green-700">Opening balances posted.</p>}
      {message?.status === "error" && <p className="text-sm text-red-600">{message.message}</p>}
    </form>
  );
}
