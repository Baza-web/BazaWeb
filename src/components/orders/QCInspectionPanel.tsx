"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitQCInspection } from "@/app/(app)/orders/production-actions";
import { formatDateTime } from "@/lib/utils";
import type { QCChecklistTemplate, QCInspection, QCChecklistResult, QCDecision } from "@prisma/client";

type InspectionWithDetails = QCInspection & { inspector: { name: string }; results: QCChecklistResult[] };

const DECISION_STYLES: Record<QCDecision, string> = {
  PASS: "bg-emerald-100 text-emerald-700",
  FAIL: "bg-red-100 text-red-700",
  NA: "bg-stone-100 text-stone-600",
};

export function QCInspectionPanel({
  orderId,
  inspections,
  templates,
  canInspect,
  isAssigned,
}: {
  orderId: string;
  inspections: InspectionWithDetails[];
  templates: QCChecklistTemplate[];
  canInspect: boolean;
  isAssigned: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { result: QCDecision; comment: string }>>(
    Object.fromEntries(templates.map((t) => [t.id, { result: "NA" as QCDecision, comment: "" }])),
  );
  const [generalNotes, setGeneralNotes] = useState("");

  function setResult(templateId: string, result: QCDecision) {
    setResults((prev) => ({ ...prev, [templateId]: { ...prev[templateId], result } }));
  }
  function setComment(templateId: string, comment: string) {
    setResults((prev) => ({ ...prev, [templateId]: { ...prev[templateId], comment } }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = templates.map((t) => ({
      templateId: t.id,
      label: t.label,
      result: results[t.id]?.result ?? "NA",
      comment: results[t.id]?.comment || undefined,
    }));
    const formData = new FormData();
    formData.set("resultsJson", JSON.stringify(payload));
    formData.set("generalNotes", generalNotes);
    startTransition(async () => {
      try {
        await submitQCInspection(orderId, formData);
        setGeneralNotes("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't submit the inspection.");
      }
    });
  }

  return (
    <div className="card space-y-4">
      <h2 className="section-title">Quality Control</h2>

      {inspections.length === 0 ? (
        <p className="text-sm text-stone-400">No QC inspections recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {inspections.map((insp) => (
            <li key={insp.id} className="rounded-lg bg-stone-50 p-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span>
                  <span className="font-medium text-ink-900">{insp.inspector.name}</span> — {formatDateTime(insp.performedAt)}
                </span>
                <span className={`badge ${DECISION_STYLES[insp.decision]}`}>{insp.decision}</span>
              </div>
              {insp.results.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-stone-600">
                  {insp.results.map((r) => (
                    <li key={r.id}>
                      {r.label}: <span className="font-medium">{r.result}</span>
                      {r.comment ? ` — ${r.comment}` : ""}
                    </li>
                  ))}
                </ul>
              )}
              {insp.generalNotes && <p className="mt-1 text-xs text-stone-500">{insp.generalNotes}</p>}
            </li>
          ))}
        </ul>
      )}

      {canInspect ? (
        templates.length === 0 ? (
          <p className="text-sm text-amber-700">
            No QC checklist items are configured yet — an Owner or Admin can add them from QC Settings.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 border-t border-stone-100 pt-3">
            <h3 className="text-sm font-semibold text-ink-900">New inspection</h3>
            <div className="space-y-2">
              {templates.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-[160px] text-sm text-ink-800">{t.label}</span>
                  {(["PASS", "FAIL", "NA"] as QCDecision[]).map((opt) => (
                    <label key={opt} className="flex items-center gap-1 text-xs">
                      <input
                        type="radio"
                        name={`result-${t.id}`}
                        checked={results[t.id]?.result === opt}
                        onChange={() => setResult(t.id, opt)}
                      />
                      {opt}
                    </label>
                  ))}
                  <input
                    className="input text-xs flex-1 min-w-[120px]"
                    placeholder="Comment"
                    value={results[t.id]?.comment ?? ""}
                    onChange={(e) => setComment(t.id, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <textarea
              className="input text-sm"
              rows={2}
              placeholder="General notes (optional)"
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
            />
            <button type="submit" disabled={isPending} className="btn-primary text-sm disabled:opacity-50">
              {isPending ? "Submitting…" : "Submit inspection"}
            </button>
            {error && <p className="text-xs text-red-700">{error}</p>}
          </form>
        )
      ) : (
        <p className="text-xs text-stone-400 border-t border-stone-100 pt-3">
          {isAssigned
            ? "You're assigned to this order, so you can't also perform its QC inspection — an independent inspector must."
            : "You don't have permission to perform QC inspections."}
        </p>
      )}
    </div>
  );
}
