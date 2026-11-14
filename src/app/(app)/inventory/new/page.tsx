import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageInventory, isCompanyWide } from "@/lib/rbac";
import { createInventoryItem } from "../actions";

const CATEGORIES = [
  "RING",
  "NECKLACE",
  "EARRING",
  "BRACELET",
  "BANGLE",
  "PENDANT",
  "LOOSE_STONE",
  "OTHER",
];

export default async function NewInventoryItemPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageInventory(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const branches = isCompanyWide(session.role) ? await db.branch.findMany({ orderBy: { name: "asc" } }) : [];

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="page-title">Add inventory item</h1>

      <form action={createInventoryItem} encType="multipart/form-data" className="card space-y-5">
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
            <label className="label">Category</label>
            <select className="input" name="category" required defaultValue="RING">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Name / description</label>
          <input className="input" name="name" required placeholder="18k Gold Solitaire Ring" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Metal type</label>
            <input className="input" name="metalType" placeholder="Gold, Silver, Platinum…" />
          </div>
          <div>
            <label className="label">Metal purity</label>
            <input className="input" name="metalPurity" placeholder="18K, 22K, 925…" />
          </div>
          <div>
            <label className="label">Gross weight (g)</label>
            <input className="input" name="grossWeightG" type="number" step="0.01" />
          </div>
          <div>
            <label className="label">Net weight (g)</label>
            <input className="input" name="netWeightG" type="number" step="0.01" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Gemstone type</label>
            <input className="input" name="gemstoneType" placeholder="Diamond, Ruby, Emerald…" />
          </div>
          <div>
            <label className="label">Carat weight</label>
            <input className="input" name="caratWeight" type="number" step="0.001" />
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
          <label className="label">Notes</label>
          <textarea className="input" name="notes" rows={2} />
        </div>

        <div>
          <label className="label">Photos</label>
          <input className="input" name="images" type="file" accept="image/*" multiple />
        </div>

        <button type="submit" className="btn-primary">
          Save item
        </button>
      </form>
    </div>
  );
}
