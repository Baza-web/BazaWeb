import { createInventoryItem } from "@/app/(app)/inventory/actions";

const SHAPES = ["RING", "NECKLACE", "EARRING", "BRACELET", "BANGLE", "PENDANT", "OTHER"];

const PURITY_PLACEHOLDER: Record<"Gold" | "Silver", string> = {
  Gold: "24K, 22K, 18K, 14K…",
  Silver: "999 (Fine), 925 (Sterling)…",
};

const PURITY_LABEL: Record<"Gold" | "Silver", string> = {
  Gold: "Karat",
  Silver: "Purity",
};

export function JewelryIntakeForm({
  metal,
  showBranchSelect,
  branches,
}: {
  metal: "Gold" | "Silver";
  showBranchSelect: boolean;
  branches: { id: string; name: string }[];
}) {
  return (
    <form action={createInventoryItem} encType="multipart/form-data" className="card space-y-5">
      <input type="hidden" name="metalType" value={metal} />

      {showBranchSelect ? (
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
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">SKU (leave blank to auto-generate)</label>
          <input className="input" name="sku" />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" name="category" required defaultValue="RING">
            {SHAPES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label">Name / description</label>
        <input className="input" name="name" required placeholder={`22K ${metal} Chain`} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">{PURITY_LABEL[metal]}</label>
          <input className="input" name="metalPurity" required placeholder={PURITY_PLACEHOLDER[metal]} />
        </div>
        <div>
          <label className="label">Gross weight (g)</label>
          <input className="input" name="grossWeightG" type="number" step="0.01" required />
        </div>
        <div>
          <label className="label">Net weight (g)</label>
          <input className="input" name="netWeightG" type="number" step="0.01" />
        </div>
      </div>

      <div>
        <label className="label">Certification (optional)</label>
        <input className="input" name="certification" placeholder="Hallmark, assay certificate, none…" />
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
          This SKU&apos;s own Drive link — extra photos, videos, or files for this piece.
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
      </div>

      <button type="submit" className="btn-primary">
        Save {metal.toLowerCase()} jewelry
      </button>
    </form>
  );
}
