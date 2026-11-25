"use server";

import { revalidatePath } from "next/cache";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageAccounting, isCompanyWide } from "@/lib/rbac";
import { parseHistoricalTotalsFile, importHistoricalTotals, type HistoricalImportResult } from "@/lib/historicalImport";

export async function importHistoricalTotalsAction(formData: FormData): Promise<HistoricalImportResult & { error?: string }> {
  const session = await requireSessionOrRedirect();
  if (!canManageAccounting(session.roles)) throw new Error("Forbidden");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { monthsPosted: [], monthsSkipped: [], rowErrors: [], error: "Attach a .xlsx or .csv file first." };
  }
  const branchId = isCompanyWide(session.roles) ? String(formData.get("branchId") || "") || null : session.branchId ?? null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { rows, error } = await parseHistoricalTotalsFile(buffer, file.name);
  if (error) return { monthsPosted: [], monthsSkipped: [], rowErrors: [], error };
  if (rows.length === 0) return { monthsPosted: [], monthsSkipped: [], rowErrors: [], error: "No usable rows found in that file." };

  const result = await importHistoricalTotals(session, branchId, rows);

  if (result.monthsPosted.length > 0) {
    revalidatePath("/accounting/trial-balance");
    revalidatePath("/accounting/balance-sheet");
    revalidatePath("/accounting/general-ledger");
    revalidatePath("/accounting/journal-entries");
  }
  return result;
}
