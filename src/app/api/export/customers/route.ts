import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { branchScope } from "@/lib/rbac";
import { buildExportSheet, xlsxResponse, timestampedFilename, type ExportColumn } from "@/lib/xlsxExport";
import { formatDate } from "@/lib/utils";

type Row = Awaited<ReturnType<typeof getCustomers>>[number];

async function getCustomers(session: Awaited<ReturnType<typeof requireSession>>, q?: string) {
  return db.customer.findMany({
    where: {
      ...branchScope(session),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q, mode: "insensitive" as const } },
              { email: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: { branch: true, _count: { select: { sales: true } } },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
}

const columns: ExportColumn<Row>[] = [
  { header: "Name", value: (r) => r.name, width: 24 },
  { header: "Phone", value: (r) => r.phone, width: 16 },
  { header: "Email", value: (r) => r.email, width: 24 },
  { header: "Address", value: (r) => r.address, width: 30 },
  { header: "Birthday", value: (r) => r.birthday, format: "date", width: 14 },
  { header: "Anniversary", value: (r) => r.anniversary, format: "date", width: 14 },
  { header: "Branch", value: (r) => r.branch.name, width: 16 },
  { header: "Purchases", value: (r) => r._count.sales, width: 12 },
  { header: "Customer since", value: (r) => r.createdAt, format: "date", width: 14 },
];

export async function GET(request: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return new Response("Unauthenticated", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const customers = await getCustomers(session, q);

  const buffer = await buildExportSheet("Customers", columns, customers, (r) => r.id);
  return xlsxResponse(buffer, timestampedFilename("customers"));
}
