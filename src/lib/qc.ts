import "server-only";
import type { Order, Staff, GoldCertificate, QCInspection } from "@prisma/client";

/**
 * "The production employee must not independently approve their own QC"
 * (spec §12) — the inspector must be neither the primary nor a supporting
 * staff member on the order they're inspecting.
 */
export function requireIndependentInspector(
  order: Order & { supportingStaff: Staff[] },
  inspectorId: string,
) {
  if (order.primaryStaffId === inspectorId || order.supportingStaff.some((s) => s.id === inspectorId)) {
    throw new Error(
      "The inspector must be independent of the order's assigned production staff — someone else must perform this QC check.",
    );
  }
}

/**
 * Dispatch must be blocked until mandatory approvals are complete (spec §12,
 * §13). Two independent gates, both optional per order so a simple manual
 * order with neither a QC history nor a certificate-requiring brand isn't
 * forced through a compliance step it never needed:
 *
 * - If the order has any QC inspection, the most recent one must be PASS
 *   (a FAIL that hasn't yet been superseded by a fresh PASS blocks it).
 * - If the order's brand requires gold certificates (Maison D'or today,
 *   configurable to any brand — see Brand.requiresGoldCertificates), at
 *   least 2 certificates on the order must be VERIFIED.
 *
 * Owner overrides must not silently bypass this — there is deliberately no
 * bypass parameter here; an Owner who needs an exception corrects the
 * underlying record (adds the verified certificate, records a passing
 * inspection) rather than skipping the check, so the exception is itself
 * audited in the normal history.
 */
export function assertDispatchAllowed(
  order: { brand: { requiresGoldCertificates: boolean } | null },
  qcInspections: QCInspection[],
  goldCertificates: GoldCertificate[],
) {
  if (qcInspections.length > 0) {
    const latest = qcInspections.reduce((a, b) => (a.performedAt > b.performedAt ? a : b));
    if (latest.decision !== "PASS") {
      throw new Error("This order's most recent QC inspection did not pass — it must pass QC before it can be dispatched.");
    }
  }

  if (order.brand?.requiresGoldCertificates) {
    const verifiedCount = goldCertificates.filter((c) => c.verificationStatus === "VERIFIED").length;
    if (verifiedCount < 2) {
      throw new Error(
        `This brand requires at least 2 verified gold certificates before dispatch (${verifiedCount} verified so far).`,
      );
    }
  }
}
