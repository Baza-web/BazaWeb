import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { canManageAccounting, isCompanyWide } from "@/lib/rbac";
import { buildExportSheet, xlsxResponse, timestampedFilename, type ExportColumn } from "@/lib/xlsxExport";

type Row = Awaited<ReturnType<typeof getLines>>[number];

async function getLines(
  session: Awaited<ReturnType<typeof requireSession>>,
  from?: string | null,
  to?: string | null,
  accountId?: string | null,
  branchId?: string | null,
) {
  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = to ? new Date(to) : new Date();
  toDate.setHours(23, 59, 59, 999);

  return db.journalLine.findMany({
    where: {
      ...(accountId ? { accountId } : {}),
      journalEntry: {
        date: { gte: fromDate, lte: toDate },
        ...(isCompanyWide(session.roles) ? (branchId ? { branchId } : {}) : { branchId: session.branchId }),
      },
    },
    include: { account: true, journalEntry: true },
    orderBy: [{ journalEntry: { date: "asc" } }],
    take: 5000,
  });
}

const columns: ExportColumn<Row>[] = [
  { header: "Date", value: (r) => r.journalEntry.date, format: "date", width: 14 },
  { header: "Entry #", value: (r) => r.journalEntry.entryNumber, width: 16 },
  { header: "Description", value: (r) => r.journalEntry.description, width: 36 },
  { header: "Account code", value: (r) => r.account.code, width: 12 },
  { header: "Account name", value: (r) => r.account.name, width: 24 },
  { header: "Debit", value: (r) => (r.debit > 0 ? r.debit : null), format: "money", width: 14 },
  { header: "Credit", value: (r) => (r.credit > 0 ? r.credit : null), format: "money", width: 14 },
];

export async function GET(request: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return new Response("Unauthenticated", { status: 401 });
  }
  if (!canManageAccounting(session.roles)) {
    return new Response("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const accountId = searchParams.get("accountId");
  const branchId = searchParams.get("branchId");
  const lines = await getLines(session, from, to, accountId, branchId);

  const buffer = await buildExportSheet("General Ledger", columns, lines, (r) => r.id);
  return xlsxResponse(buffer, timestampedFilename("general-ledger"));
}
