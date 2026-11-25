import Link from "next/link";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageQRCodes } from "@/lib/rbac";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { toggleQRCodeActive } from "./actions";
import { QrCode } from "@/components/icons";
import { CreateQRCodeForm } from "@/components/CreateQRCodeForm";
import { TARGET_LABELS } from "@/lib/qrTargets";

export default async function QRManagementPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageQRCodes(session.roles)) {
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
        <CreateQRCodeForm
          products={products.map((p) => ({ id: p.id, label: `${p.name} (${p.sku})` }))}
          gemstones={gemstones.map((g) => ({
            id: g.id,
            label: `${g.gemstoneType}${g.caratWeight ? ` ${g.caratWeight}ct` : ""} — ${g.order.orderNumber}`,
          }))}
          certificates={certificates.map((c) => ({ id: c.id, label: `#${c.certificateNumber} — ${c.order.orderNumber}` }))}
          branches={branches.map((b) => ({ id: b.id, label: b.name }))}
          tours={tours.map((t) => ({ id: t.id, label: t.title }))}
        />
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
