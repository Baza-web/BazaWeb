import { formatDate } from "@/lib/utils";
import { addGoldCertificate, reviewGoldCertificate, deleteGoldCertificate } from "@/app/(app)/orders/production-actions";
import type { GoldCertificate, CertificateVerificationStatus } from "@prisma/client";
import { Trash } from "@/components/icons";

type CertWithVerifier = GoldCertificate & { verifiedBy: { name: string } | null };

const STATUS_STYLES: Record<CertificateVerificationStatus, string> = {
  UNVERIFIED: "bg-amber-100 text-amber-700",
  VERIFIED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-red-100 text-red-700",
};

export function GoldCertificatePanel({
  orderId,
  certificates,
  canReview,
}: {
  orderId: string;
  certificates: CertWithVerifier[];
  canReview: boolean;
}) {
  const verifiedCount = certificates.filter((c) => c.verificationStatus === "VERIFIED").length;

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Gold Certificates</h2>
        <span className={`badge ${verifiedCount >= 2 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {verifiedCount}/2 verified
        </span>
      </div>
      <p className="text-xs text-stone-500">
        This brand requires at least 2 verified gold certificates before this order can be dispatched.
      </p>

      {certificates.length === 0 ? (
        <p className="text-sm text-stone-400">No certificates on file yet.</p>
      ) : (
        <ul className="space-y-2">
          {certificates.map((c) => (
            <li key={c.id} className="rounded-lg bg-stone-50 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink-900">
                    #{c.certificateNumber} {c.issuingAuthority ? `— ${c.issuingAuthority}` : ""}
                  </p>
                  <p className="text-xs text-stone-500">
                    {c.goldSpecification ?? "No specification recorded"}
                    {c.documentUrl && (
                      <>
                        {" · "}
                        <a href={c.documentUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                          View document
                        </a>
                      </>
                    )}
                  </p>
                  {c.verifiedBy && (
                    <p className="mt-1 text-xs text-stone-500">
                      Reviewed by {c.verifiedBy.name} on {c.verifiedAt ? formatDate(c.verifiedAt) : "—"}
                      {c.notes ? ` — ${c.notes}` : ""}
                    </p>
                  )}
                </div>
                <span className={`badge shrink-0 ${STATUS_STYLES[c.verificationStatus]}`}>{c.verificationStatus}</span>
              </div>
              {canReview && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <form action={reviewGoldCertificate.bind(null, c.id)} className="flex flex-wrap items-end gap-2">
                    <select className="input text-xs" name="decision" defaultValue="VERIFIED">
                      <option value="VERIFIED">Mark verified</option>
                      <option value="REJECTED">Reject</option>
                    </select>
                    <input className="input text-xs flex-1 min-w-[140px]" name="notes" placeholder="Review notes" />
                    <button type="submit" className="btn-secondary text-xs">Save review</button>
                  </form>
                  <form action={deleteGoldCertificate.bind(null, c.id)}>
                    <button type="submit" className="text-red-600 hover:underline" aria-label="Remove"><Trash size={14} /></button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form action={addGoldCertificate.bind(null, orderId)} encType="multipart/form-data" className="grid grid-cols-2 gap-2 border-t border-stone-100 pt-3 sm:grid-cols-4">
        <input className="input text-sm" name="certificateNumber" placeholder="Certificate number" required />
        <input className="input text-sm" name="issuingAuthority" placeholder="Issuing authority" />
        <input className="input text-sm" name="goldSpecification" placeholder="Gold specification" />
        <input className="input text-sm" type="file" name="document" accept="image/*,.pdf" />
        <input className="input text-sm col-span-2" name="notes" placeholder="Notes" />
        <button type="submit" className="btn-secondary text-sm col-span-2">Add certificate</button>
      </form>
    </div>
  );
}
