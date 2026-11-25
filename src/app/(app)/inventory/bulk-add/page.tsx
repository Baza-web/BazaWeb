import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageInventory } from "@/lib/rbac";
import { previewBulkCreateInventory, applyBulkCreateInventory } from "../actions";
import { discardImportBatch } from "../../import/actions";
import { BulkCreatePanel } from "@/components/BulkCreatePanel";

export default async function InventoryBulkAddPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageInventory(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="page-title">Add new items in bulk</h1>
        <p className="text-sm text-stone-500">
          Download the template, add one row per new item, then upload it back here. You&apos;ll see exactly what will
          be created before anything is saved. To edit items that already exist instead, use{" "}
          <a href="/import" className="text-brand-700 hover:underline">
            Bulk import
          </a>
          .
        </p>
      </div>
      <div className="card">
        <BulkCreatePanel
          templateHref="/api/export/inventory-new-template"
          previewAction={previewBulkCreateInventory}
          applyAction={applyBulkCreateInventory}
          discardAction={discardImportBatch}
          entitySingular="item"
          entityPlural="items"
          googleClientId={process.env.GOOGLE_CLIENT_ID}
          googlePickerApiKey={process.env.GOOGLE_PICKER_API_KEY}
        />
      </div>
    </div>
  );
}
