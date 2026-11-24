import Link from "next/link";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageQRCodes, isCompanyWide } from "@/lib/rbac";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { createQRCode, toggleQRCodeActive } from "./actions";
import { QrCode } from "@/components/icons";

const TARGET_LABELS: Record<string, string> = {
  PRODUCT: "Product",
  GEMSTONE: "Gemstone",
  CERTIFICATE: "Gold certificate",
  BOUTIQUE: "Boutique",
  TRAVEL_EXPERIENCE: "Travel experience",
  CAMPAIGN: "Campaign (external link)",
};

export default async function QRManagementPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageQRCodes(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const [qrCodes, products, branches, tours, gemstones, certificates] = await Promise.all([
    db.qRCode.findMany({
      include: { createdBy: true, _count: { select: { scans: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.inventoryItem.findMany({ select: { id: true, name: true, sku: true }, orderBy: { name: "asc" }, take: 300 }),
    db.branch.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.tour.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" }, take: 300 }),
    db.orderGemstoneSpec.findMany({
      select: { id: true, gemstoneType: true, caratWeight: true, order: { select: { orderNumber: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    db.goldCertificate.findMany({
      select: { id: true, certificateNumber: true, order: { select: { orderNumber: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="page-title flex items-center gap-2">
        <QrCode size={26} className="text-brand-500" aria-hidden="true" />
        QR Management
      </h1>
      <p className="text-sm text-stone-500">
        Every QR code is dynamic — scan it, change what it points to anytime, without reprinting the physical
        code. Scans never expose cost prices, customer names or order values; see each code&apos;s public page
        before printing it.
      </p>

      <div className="card">
        <h2 className="section-title mb-3">Create a QR code</h2>
        <form action={async (formData: FormData) => {
          "use server";
          const id = await createQRCode(formData);
          const { redirect } = await import("next/navigation");
          redirect(`/qr/${id}`);
        }} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Label (internal — where is this going?)</label>
              <input className="input" name="label" placeholder="e.g. Front counter display — Ring #4521" required />
            </div>
            <div>
              <label className="label">Points to</label>
              <select className="input" name="targetType" required defaultValue="PRODUCT" id="qr-target-type">
                {Object.entries(TARGET_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Target</label>
            <select className="input" name="targetId">
              <optgroup label="Products">
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
              </optgroup>
              <optgroup label="Gemstones">
                {gemstones.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.gemstoneType}{g.caratWeight ? ` ${g.caratWeight}ct` : ""} — {g.order.orderNumber}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Gold certificates">
                {certificates.map((c) => (
                  <option key={c.id} value={c.id}>#{c.certificateNumber} — {c.order.orderNumber}</option>
                ))}
              </optgroup>
              <optgroup label="Boutiques">
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </optgroup>
              <optgroup label="Travel experiences">
                {tours.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </optgroup>
            </select>
            <p className="mt-1 text-xs text-stone-400">Leave blank for a Campaign QR and fill in the URL below instead.</p>
          </div>
          <div>
            <label className="label">External URL (Campaign only)</label>
            <input className="input" name="externalUrl" type="url" placeholder="https://instagram.com/bazaboutique" />
          </div>
          <button type="submit" className="btn-primary text-sm">Generate QR code</button>
        </form>
      </div>

      <div className="card">
        <h2 className="section-title mb-3">All QR codes</h2>
        {qrCodes.length === 0 ? (
          <p className="text-sm text-stone-400">No QR codes yet — create the first one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Label</th><th>Type</th><th>Scans</th><th>Created</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {qrCodes.map((qr) => (
                  <tr key={qr.id}>
                    <td>
                      <Link href={`/qr/${qr.id}`} className="text-brand-600 hover:underline">{qr.label}</Link>
                    </td>
                    <td>{TARGET_LABELS[qr.targetType]}</td>
                    <td>{qr._count.scans}</td>
                    <td className="text-xs text-stone-500">{formatDateTime(qr.createdAt)} · {qr.createdBy.name}</td>
                    <td>
                      <span className={`badge ${qr.active ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-600"}`}>
                        {qr.active ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td>
                      <form action={toggleQRCodeActive.bind(null, qr.id)}>
                        <button type="submit" className="btn-secondary text-xs">{qr.active ? "Deactivate" : "Reactivate"}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
