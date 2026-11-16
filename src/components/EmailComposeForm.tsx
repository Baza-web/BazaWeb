"use client";

import { useRef, useState, useTransition } from "react";
import { sendCustomerEmail } from "@/app/(app)/email/actions";

export function EmailComposeForm({
  customerId,
  customerName,
  customerEmail,
  disabled,
}: {
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  disabled?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSent(false);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await sendCustomerEmail(customerId, fd);
        setSent(true);
        formRef.current?.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't send that email.");
      }
    });
  }

  if (!customerEmail) {
    return <p className="text-sm text-red-600">{customerName} has no email address on file — add one on their profile first.</p>;
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      <fieldset disabled={disabled || isPending} className="space-y-3">
        <p className="text-sm text-stone-500">
          To: <span className="font-medium text-ink-800">{customerName}</span> &lt;{customerEmail}&gt;
        </p>
        <div>
          <label className="label">Subject</label>
          <input className="input" name="subject" required />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea className="input" name="body" rows={6} required />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {sent && <p className="text-xs text-green-700">Sent.</p>}
        <button type="submit" className="btn-primary">
          {isPending ? "Sending…" : "Send email"}
        </button>
      </fieldset>
    </form>
  );
}
