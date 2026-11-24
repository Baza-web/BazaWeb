import { requireSessionOrRedirect } from "@/lib/auth";
import { canEditQCChecklistTemplate } from "@/lib/rbac";
import { db } from "@/lib/db";
import { addQCChecklistTemplateItem, deactivateQCChecklistTemplateItem, seedDefaultQCChecklist } from "../production-actions";
import { ClipboardText, Trash } from "@/components/icons";

export default async function QCSettingsPage() {
  const session = await requireSessionOrRedirect();
  if (!canEditQCChecklistTemplate(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const templates = await db.qCChecklistTemplate.findMany({ orderBy: [{ active: "desc" }, { sortOrder: "asc" }] });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="page-title flex items-center gap-2">
        <ClipboardText size={26} className="text-brand-500" aria-hidden="true" />
        QC Checklist Settings
      </h1>
      <p className="text-sm text-stone-500">
        These items appear on every new QC inspection across Orders Handling. Deactivating an item keeps its history on
        past inspections but removes it from future ones — items are never hard-deleted.
      </p>

      <div className="card">
        <h2 className="section-title mb-3">Checklist items</h2>
        {templates.length === 0 ? (
          <div className="mb-4 space-y-2">
            <p className="text-sm text-stone-400">No checklist items configured yet — add one below, or start from the suggested jewellery QC checklist.</p>
            <form action={seedDefaultQCChecklist}>
              <button type="submit" className="btn-secondary text-sm">Load suggested checklist (14 items)</button>
            </form>
          </div>
        ) : (
          <ul className="mb-4 space-y-1">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
                <span className={t.active ? "text-ink-900" : "text-stone-400 line-through"}>{t.label}</span>
                {t.active && (
                  <form action={deactivateQCChecklistTemplateItem.bind(null, t.id)}>
                    <button type="submit" className="text-red-600 hover:underline" aria-label="Deactivate">
                      <Trash size={14} />
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <form action={addQCChecklistTemplateItem} className="flex items-end gap-2">
          <input className="input text-sm flex-1" name="label" placeholder="e.g. Metal purity verification" required />
          <button type="submit" className="btn-primary text-sm">Add item</button>
        </form>
      </div>
    </div>
  );
}
