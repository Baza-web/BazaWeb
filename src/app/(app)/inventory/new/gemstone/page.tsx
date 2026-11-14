import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageInventory, isCompanyWide } from "@/lib/rbac";
import { createInventoryItem } from "../../actions";
import { Diamond } from "@/components/icons";

export default async function NewGemstonePage() {
  const session = await requireSessionOrRedirect();
  if (!canManageInventory(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const branches = isCompanyWide(session.role) ? await db.branch.findMany({ orderBy: { name: "asc" } }) : [];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="flex items-center gap-2 text-sm text-purple-600">
          <Diamond size={16} weight="fill" aria-hidden="true" />
          Loose Gemstone
        </p>
        <h1 className="page-title">Add a gemstone</h1>
      </div>

      <form action={createInventoryItem} encType="multipart/form-data" className="card space-y-5">
        <input type="hidden" name="category" value="LOOSE_STONE" />

        {isCompanyWide(session.role) ? (
          <div>
            <label className="label">Branch</label>
            <select className="input" name="branchId" required>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <input type="hidden" name="branchId" value={session.branchId ?? ""} />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">SKU (leave blank to auto-generate)</label>
            <input className="input" name="sku" />
          </div>
          <div>
            <label className="label">Gemstone type</label>
            <input className="input" name="gemstoneType" required placeholder="Diamond, Ruby, Emerald…" />
          </div>
        </div>

        <div>
          <label className="label">Name / description</label>
          <input className="input" name="name" required placeholder="0.5ct Round Brilliant Ruby" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Carat weight</label>
            <input className="input" name="caratWeight" type="number" step="0.001" required />
          </div>
          <div>
            <label className="label">Clarity</label>
            <input className="input" name="clarity" placeholder="VS1, SI2…" />
          </div>
          <div>
            <label className="label">Cut</label>
            <input className="input" name="cut" placeholder="Round, Princess…" />
          </div>
        </div>

        <div>
          <label className="label">Certification</label>
          <input className="input" name="certification" placeholder="GIA report #, IGI, none…" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Cost price</label>
            <input className="input" name="costPrice" type="number" step="0.01" required />
          </div>
          <div>
            <label className="label">Selling price</label>
            <input className="input" name="sellingPrice" type="number" step="0.01" required />
          </div>
          <div>
            <label className="label">Quantity</label>
            <input className="input" name="quantity" type="number" defaultValue={1} min={1} />
          </div>
          <div>
            <label className="label">Low stock alert at</label>
            <input className="input" name="lowStockAt" type="number" defaultValue={1} min={0} />
          </div>
        </div>

        <div>
          <label className="label">Google Drive link (optional)</label>
          <input className="input" name="driveLink" type="url" placeholder="https://drive.google.com/…" />
          <p className="mt-1 text-xs text-stone-400">
            This SKU&apos;s own Drive link — extra photos, videos, or files for this gemstone.
          </p>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea className="input" name="notes" rows={2} />
        </div>

        <div>
          <label className="label">Photos</label>
          <input className="input" name="images" type="file" accept="image/*" multiple />
        </div>

        <div>
          <label className="label">Certificates / documents (optional)</label>
          <input className="input" name="documents" type="file" accept="image/*,.pdf" multiple />
          <p className="mt-1 text-xs text-stone-400">E.g. a GIA grading report, as a PDF or photo.</p>
        </div>

        <button type="submit" className="btn-primary">
          Save gemstone
        </button>
      </form>
    </div>
  );
}
