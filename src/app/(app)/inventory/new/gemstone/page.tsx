import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageInventory, canViewCost, isCompanyWide } from "@/lib/rbac";
import { createInventoryItem } from "../../actions";
import { LockedOptionSelect } from "@/components/LockedOptionSelect";
import { Diamond } from "@/components/icons";

async function attributeOptions(kind: "GEMSTONE_TYPE" | "CLARITY" | "CUT" | "CERTIFICATION") {
  const rows = await db.inventoryAttributeOption.findMany({
    where: { kind, active: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => r.name);
}

export default async function NewGemstonePage() {
  const session = await requireSessionOrRedirect();
  if (!canManageInventory(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const [branches, brands, gemstoneTypes, clarities, cuts, certifications] = await Promise.all([
    isCompanyWide(session.roles) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    attributeOptions("GEMSTONE_TYPE"),
    attributeOptions("CLARITY"),
    attributeOptions("CUT"),
    attributeOptions("CERTIFICATION"),
  ]);

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

        {isCompanyWide(session.roles) ? (
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

        {brands.length > 0 && (
          <div>
            <label className="label">Brand (optional)</label>
            <select className="input" name="brandId" defaultValue="">
              <option value="">No specific brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">SKU (leave blank to auto-generate)</label>
            <input className="input" name="sku" />
          </div>
          <div>
            <label className="label">Gemstone type</label>
            <LockedOptionSelect name="gemstoneType" kind="GEMSTONE_TYPE" options={gemstoneTypes} required placeholder="Diamond, Ruby, Sapphire…" />
          </div>
        </div>

        <div>
          <label className="label">Name / description</label>
          <input className="input" name="name" required placeholder="0.5ct Round Brilliant Natural Ruby" />
          <p className="mt-1 text-xs text-stone-400">
            Put the detail here (natural/heated, origin, colour…) — the type above stays the clean
            category so analytics can roll it up correctly, e.g. every Sapphire together.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Carat weight</label>
            <input className="input" name="caratWeight" type="number" step="0.001" required />
          </div>
          <div>
            <label className="label">Clarity</label>
            <LockedOptionSelect name="clarity" kind="CLARITY" options={clarities} allowEmpty placeholder="VS1, SI2…" />
          </div>
          <div>
            <label className="label">Cut</label>
            <LockedOptionSelect name="cut" kind="CUT" options={cuts} allowEmpty placeholder="Round, Princess…" />
          </div>
        </div>

        <div>
          <label className="label">Certification</label>
          <LockedOptionSelect name="certification" kind="CERTIFICATION" options={certifications} allowEmpty placeholder="GIA, IGI, none…" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {canViewCost(session.roles) ? (
            <div>
              <label className="label">Cost price</label>
              <input className="input" name="costPrice" type="number" step="0.01" required />
            </div>
          ) : (
            <input type="hidden" name="costPrice" value="0" />
          )}
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
