import Image from "next/image";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageInventory } from "@/lib/rbac";
import { formatMoney, formatDateTime } from "@/lib/utils";
import { updateInventoryStatus } from "../actions";

export default async function InventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;

  const item = await db.inventoryItem.findUnique({
    where: { id },
    include: { branch: true, saleItems: { include: { sale: true } } },
  });
  if (!item) notFound();

  const detail: { label: string; value: string | null }[] = [
    { label: "Metal", value: [item.metalType, item.metalPurity].filter(Boolean).join(" · ") || null },
    {
      label: "Weight",
      value:
        item.grossWeightG || item.netWeightG
          ? `${item.grossWeightG ?? "—"}g gross / ${item.netWeightG ?? "—"}g net`
          : null,
    },
    { label: "Gemstone", value: item.gemstoneType },
    { label: "Carat", value: item.caratWeight ? `${item.caratWeight} ct` : null },
    { label: "Clarity / Cut", value: [item.clarity, item.cut].filter(Boolean).join(" · ") || null },
    { label: "Certification", value: item.certification },
  ].filter((d) => d.value);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-stone-500">{item.sku}</p>
        <h1 className="page-title">{item.name}</h1>
        <p className="text-sm text-stone-500">{item.branch.name}</p>
      </div>

      {item.images.length > 0 && (
        <div className="flex gap-3 overflow-x-auto">
          {item.images.map((src) => (
            <div key={src} className="relative h-32 w-32 shrink-0 overflow-hidden rounded-lg border border-stone-200">
              <Image src={src} alt={item.name} fill className="object-cover" unoptimized />
            </div>
          ))}
        </div>
      )}

      <div className="card grid grid-cols-2 gap-4">
        {detail.map((d) => (
          <div key={d.label}>
            <p className="text-xs text-stone-500">{d.label}</p>
            <p className="font-medium">{d.value}</p>
          </div>
        ))}
        <div>
          <p className="text-xs text-stone-500">Cost price</p>
          <p className="font-medium">{formatMoney(item.costPrice)}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Selling price</p>
          <p className="font-medium">{formatMoney(item.sellingPrice)}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Quantity</p>
          <p className="font-medium">{item.quantity}</p>
        </div>
      </div>

      {item.notes && (
        <div className="card">
          <p className="text-xs text-stone-500">Notes</p>
          <p>{item.notes}</p>
        </div>
      )}

      {canManageInventory(session.role) && (
        <div className="card">
          <p className="mb-2 text-sm font-medium">Status: {item.status.replace("_", " ")}</p>
          <form action={updateInventoryStatus.bind(null, item.id)} className="flex gap-2">
            <select className="input max-w-[200px]" name="status" defaultValue={item.status}>
              <option value="IN_STOCK">In stock</option>
              <option value="RESERVED">Reserved</option>
              <option value="IN_REPAIR">In repair</option>
              <option value="CONSIGNMENT">Consignment</option>
              <option value="SOLD">Sold</option>
            </select>
            <button type="submit" className="btn-secondary">
              Update status
            </button>
          </form>
        </div>
      )}

      {item.saleItems.length > 0 && (
        <div className="card">
          <p className="mb-2 text-sm font-medium">Sale history</p>
          <ul className="space-y-1 text-sm">
            {item.saleItems.map((si) => (
              <li key={si.id}>
                {si.sale.invoiceNumber} — {formatMoney(si.priceEach)} on {formatDateTime(si.sale.createdAt)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
