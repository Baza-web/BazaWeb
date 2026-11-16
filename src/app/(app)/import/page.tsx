import { requireSessionOrRedirect } from "@/lib/auth";
import { ImportWizard } from "@/components/ImportWizard";

export default async function ImportPage() {
  const session = await requireSessionOrRedirect();
  if (session.role !== "OWNER") {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="page-title">Bulk import</h1>
        <p className="text-sm text-stone-500">
          Export Customers or Inventory to Excel, make your edits there, then upload the file back here to apply
          many changes at once. You&apos;ll see exactly what will change before anything is saved.
        </p>
      </div>
      <div className="card">
        <ImportWizard googleClientId={process.env.GOOGLE_CLIENT_ID} googlePickerApiKey={process.env.GOOGLE_PICKER_API_KEY} />
      </div>
    </div>
  );
}
