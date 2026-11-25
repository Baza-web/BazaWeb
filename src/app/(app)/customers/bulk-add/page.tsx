import { requireSessionOrRedirect } from "@/lib/auth";
import { previewBulkCreateCustomers, applyBulkCreateCustomers } from "../actions";
import { discardImportBatch } from "../../import/actions";
import { BulkCreatePanel } from "@/components/BulkCreatePanel";

export default async function CustomersBulkAddPage() {
  await requireSessionOrRedirect();

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="page-title">Add new customers in bulk</h1>
        <p className="text-sm text-stone-500">
          Download the template, add one row per new customer, then upload it back here. You&apos;ll see exactly what
          will be created before anything is saved.
        </p>
      </div>
      <div className="card">
        <BulkCreatePanel
          templateHref="/api/export/customers-new-template"
          previewAction={previewBulkCreateCustomers}
          applyAction={applyBulkCreateCustomers}
          discardAction={discardImportBatch}
          entitySingular="customer"
          entityPlural="customers"
          googleClientId={process.env.GOOGLE_CLIENT_ID}
          googlePickerApiKey={process.env.GOOGLE_PICKER_API_KEY}
        />
      </div>
    </div>
  );
}
