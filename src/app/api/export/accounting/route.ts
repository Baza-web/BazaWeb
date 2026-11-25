import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { branchScope, canManageAccounting } from "@/lib/rbac";
import { buildExportSheet, xlsxResponse, timestampedFilename, type ExportColumn } from "@/lib/xlsxExport";

type Row = Awaited<ReturnType<typeof getLedger>>[number];

async function getLedger(
  session: Awaited<ReturnType<typeof requireSession>>,
  from?: string | null,
  to?: string | null,
  branchId?: string | null,
  brandId?: string | null,
) {
  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = to ? new Date(to) : new Date();
  toDate.setHours(23, 59, 59, 999);
  const brandFilter = brandId ? { OR: [{ sale: { brandId } }, { expense: { brandId } }] } : {};

  return db.ledgerEntry.findMany({
    where: {
      ...branchScope(session, branchId),
      ...brandFilter,
      date: { gte: fromDate, lte: toDate },
    },
    include: { branch: true, sale: true, expense: true },
    orderBy: { date: "desc" },
    take: 5000,
  });
}

const columns: ExportColumn<Row>[] = [
  { header: "Date", value: (r) => r.date, format: "date", width: 14 },
  { header: "Branch", value: (r) => r.branch.name, width: 16 },
  { header: "Type", value: (r) => r.type, width: 12 },
  { header: "Description", value: (r) => r.description, width: 36 },
  { header: "Amount", value: (r) => r.amount, format: "money", width: 14 },
  { header: "Linked invoice", value: (r) => r.sale?.invoiceNumber, width: 20 },
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
  const branchId = searchParams.get("branchId");
  const brandId = searchParams.get("brandId");
  const entries = await getLedger(session, from, to, branchId, brandId);

  const buffer = await buildExportSheet("Ledger", columns, entries, (r) => r.id);
  return xlsxResponse(buffer, timestampedFilename("accounting-ledger"));
}
