"use client";

import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createRepairOrder } from "@/app/(app)/repairs/actions";

type Option = { id: string; name: string; branchId: string | null };
type ProductOption = Option & { sku: string; sellingPrice: number };

export function CreateRepairOrderForm({
  isCompanyWide,
  defaultBranchId,
  branches,
  customers,
  products,
  craftsmen,
  salesStaff,
}: {
  isCompanyWide: boolean;
  defaultBranchId: string;
  branches: { id: string; name: string }[];
  customers: Option[];
  products: ProductOption[];
  craftsmen: Option[];
  salesStaff: Option[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState(defaultBranchId || branches[0]?.id || "");
  const [productId, setProductId] = useState("");
  const [description, setDescription] = useState("");

  const branchCustomers = useMemo(() => customers.filter((c) => c.branchId === branchId), [customers, branchId]);
  const branchProducts = useMemo(() => products.filter((p) => p.branchId === branchId), [products, branchId]);
  const branchCraftsmen = useMemo(() => craftsmen.filter((c) => c.branchId === branchId), [craftsmen, branchId]);
  const branchSales = useMemo(() => salesStaff.filter((s) => s.branchId === branchId), [salesStaff, branchId]);

  function handleProductChange(id: string) {
    setProductId(id);
    const product = branchProducts.find((p) => p.id === id);
    if (product) setDescription(`${product.name} (${product.sku})`);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const result = await createRepairOrder(formData);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        formRef.current?.reset();
        setProductId("");
        setDescription("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't create this order.");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4" encType="multipart/form-data">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {isCompanyWide && (
          <div>
            <label className="label">Branch</label>
            <select
              className="input"
              name="branchId"
              required
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setProductId("");
              }}
            >
              <option value="" disabled>
                Select branch…
              </option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label">Customer</label>
          {/* key resets the select when the branch changes, instead of keeping a stale
              cross-branch selection the server would reject */}
          <select className="input" name="customerId" required defaultValue="" key={branchId}>
            <option value="" disabled>
              Select customer…
            </option>
            {branchCustomers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" name="type" defaultValue="REPAIR">
            <option value="REPAIR">Repair</option>
            <option value="CUSTOM">Custom order</option>
          </select>
        </div>
        <div>
          <label className="label">Product (optional — most orders are for a catalogue piece)</label>
          <select
            className="input"
            name="relatedInventoryItemId"
            value={productId}
            onChange={(e) => handleProductChange(e.target.value)}
          >
            <option value="">— Custom / not in catalogue —</option>
            {branchProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
          {productId && (
            <p className="mt-1 text-xs text-stone-400">
              Pre-filled the description below — edit it if this order is more than just that piece.
            </p>
          )}
          {branchProducts.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">No in-stock catalogue items for this branch yet.</p>
          )}
        </div>
      </div>

      <div>
        <label className="label">Description</label>
        <textarea
          className="input"
          name="description"
          rows={2}
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Promised date</label>
          <input className="input" name="promisedDate" type="date" />
        </div>
        <div>
          <label className="label">Estimated cost</label>
          <input className="input" name="estimatedCost" type="number" step="0.01" min="0" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Assigned craftsman</label>
          <select className="input" name="assignedToId" defaultValue="" key={`craftsman-${branchId}`}>
            <option value="">Unassigned</option>
            {branchCraftsmen.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Assigned sales</label>
          <select className="input" name="assignedSalesId" defaultValue="" key={`sales-${branchId}`}>
            <option value="">Unassigned</option>
            {branchSales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-stone-400">
            Both stay assigned to this order until the customer&apos;s follow-up is closed.
          </p>
        </div>
      </div>

      <div>
        <label className="label">Photos (optional)</label>
        <input className="input" name="photos" type="file" accept="image/*" multiple />
      </div>

      <div>
        <label className="label">Notes (optional)</label>
        <textarea className="input" name="notes" rows={2} />
      </div>

      {error && <p className="text-xs text-red-700">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
        {pending ? "Creating…" : "Create order"}
      </button>
    </form>
  );
}
