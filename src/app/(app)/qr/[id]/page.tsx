import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageQRCodes } from "@/lib/rbac";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { generateQRImageDataUrl, qrScanUrl, resolveQRTarget } from "@/lib/qr";
import { updateQRCodeTarget, toggleQRCodeActive, deleteQRCode } from "../actions";
import { PrintButton } from "@/components/PrintButton";
import { Trash } from "@/components/icons";

function safeHostname(url: string | null) {
  if (!url) return "Direct scan";
  try {
    return new URL(url).hostname;
  } catch {
    return "Direct scan";
  }
}

const TARGET_LABELS: Record<string, string> = {
  PRODUCT: "Product",
  GEMSTONE: "Gemstone",
  CERTIFICATE: "Gold certificate",
  BOUTIQUE: "Boutique",
  TRAVEL_EXPERIENCE: "Travel experience",
  CAMPAIGN: "Campaign (external link)",
};

export default async function QRCodeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  if (!canManageQRCodes(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { id } = await params;
  const qr = await db.qRCode.findUnique({
    where: { id },
    include: {
      createdBy: true,
      scans: { orderBy: { scannedAt: "desc" }, take: 50 },
      _count: { select: { scans: true } },
    },
  });
  if (!qr) notFound();

  const [imageDataUrl, target] = await Promise.all([
    generateQRImageDataUrl(qr.code),
    resolveQRTarget(qr.targetType, qr.targetId, qr.externalUrl),
  ]);

  const scanUrl = qrScanUrl(qr.code);
  const scansLast7Days = qr.scans.filter((s) => s.scannedAt.getTime() > Date.now() - 7 * 86_400_000).length;

  return (
    <div className="max-w-2xl space-y-6 print:max-w-full">
      <div className="print:hidden">
        <Link href="/qr" className="text-sm font-medium text-brand-600 hover:underline">← QR Management</Link>
        <h1 className="page-title mt-1">{qr.label}</h1>
        <p className="text-sm text-stone-500">
          {TARGET_LABELS[qr.targetType]} ·{" "}
          <span className={`badge ${qr.active ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-600"}`}>
            {qr.active ? "Active" : "Deactivated"}
          </span>
        </p>
      </div>

      <div className="card flex flex-col items-center gap-3 text-center print:border-0 print:shadow-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageDataUrl} alt={`QR code for ${qr.label}`} className="h-48 w-48" />
        <p className="font-display text-sm text-stone-600">{qr.label}</p>
        <p className="break-all text-xs text-stone-400">{scanUrl}</p>
        <div className="print:hidden">
          <PrintButton label="Print this QR code" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 print:hidden">
        <div className="stat-tile">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Total scans</p>
          <p className="mt-1 text-xl font-semibold text-ink-900">{qr._count.scans}</p>
        </div>
        <div className="stat-tile">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Last 7 days</p>
          <p className="mt-1 text-xl font-semibold text-ink-900">{scansLast7Days}</p>
        </div>
        <div className="stat-tile">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Created</p>
          <p className="mt-1 text-sm font-semibold text-ink-900">{formatDateTime(qr.createdAt)}</p>
        </div>
      </div>

      <div className="card print:hidden">
        <h2 className="section-title mb-3">What a scan currently shows</h2>
        {target.kind === "not_found" ? (
          <p className="text-sm text-amber-700">
            This QR&apos;s target no longer exists (deleted, or the link is broken). Scanning it will show a
            friendly &quot;not found&quot; page — update the target below.
          </p>
        ) : target.kind === "redirect" ? (
          <p className="text-sm text-ink-800">Redirects straight to <span className="break-all font-medium">{target.url}</span></p>
        ) : (
          <p className="text-sm text-ink-800">
            A public page showing only safe, non-confidential fields for this {TARGET_LABELS[qr.targetType].toLowerCase()} —
            never cost prices, customer names, or order values.
          </p>
        )}
      </div>

      <div className="card print:hidden">
        <h2 className="section-title mb-3">Change what this QR points to</h2>
        <p className="mb-3 text-xs text-stone-500">
          This is the whole point of a dynamic QR — change the destination anytime without reprinting the
          physical code.
        </p>
        <form action={updateQRCodeTarget.bind(null, qr.id)} className="space-y-3">
          <input className="input" name="label" defaultValue={qr.label} required />
          <select className="input" name="targetType" defaultValue={qr.targetType}>
            {Object.entries(TARGET_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input className="input" name="targetId" placeholder="Target ID (leave blank for Campaign)" defaultValue={qr.targetId ?? ""} />
          <input className="input" name="externalUrl" type="url" placeholder="External URL (Campaign only)" defaultValue={qr.externalUrl ?? ""} />
          <button type="submit" className="btn-primary text-sm">Save</button>
        </form>
      </div>

      <div className="card print:hidden">
        <h2 className="section-title mb-3">Recent scans</h2>
        {qr.scans.length === 0 ? (
          <p className="text-sm text-stone-400">No scans recorded yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {qr.scans.map((s) => (
              <li key={s.id} className="flex items-center justify-between border-b border-stone-100 pb-1 last:border-0">
                <span>{formatDateTime(s.scannedAt)}</span>
                <span className="text-xs text-stone-400">{safeHostname(s.referrer)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-4 print:hidden">
        <form action={toggleQRCodeActive.bind(null, qr.id)}>
          <button type="submit" className="btn-secondary text-sm">{qr.active ? "Deactivate" : "Reactivate"}</button>
        </form>
        <form
          action={async () => {
            "use server";
            await deleteQRCode(qr.id);
            const { redirect } = await import("next/navigation");
            redirect("/qr");
          }}
        >
          <button type="submit" className="flex items-center gap-1 text-sm text-red-600 hover:underline">
            <Trash size={14} /> Delete
          </button>
        </form>
      </div>
    </div>
  );
}
