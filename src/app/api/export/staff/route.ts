import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { branchScope, canManageStaffScoped, canViewSalary, ROLE_LABELS } from "@/lib/rbac";
import { buildExportSheet, xlsxResponse, timestampedFilename, type ExportColumn } from "@/lib/xlsxExport";

type Row = Awaited<ReturnType<typeof getStaff>>[number];

async function getStaff(session: Awaited<ReturnType<typeof requireSession>>) {
  return db.staff.findMany({
    where: { ...branchScope(session), deletedAt: null },
    include: { branch: true, brands: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

function buildColumns(showSalary: boolean): ExportColumn<Row>[] {
  const cols: ExportColumn<Row>[] = [
    { header: "Name", value: (r) => r.name, width: 24 },
    { header: "Email", value: (r) => r.email, width: 28 },
    { header: "Phone", value: (r) => r.phone, width: 16 },
    { header: "Role", value: (r) => ROLE_LABELS[r.role], width: 16 },
    { header: "Branch", value: (r) => r.branch?.name, width: 16 },
    { header: "Brands", value: (r) => r.brands.map((b) => b.name).join(", "), width: 24 },
    { header: "Active", value: (r) => (r.active ? "Yes" : "No"), width: 10 },
    { header: "Date of joining", value: (r) => r.dateOfJoining, format: "date", width: 14 },
    { header: "NIC", value: (r) => r.nic, width: 16 },
  ];
  if (showSalary) {
    cols.push(
      { header: "Base salary", value: (r) => r.baseSalary, format: "money", width: 14 },
      { header: "Bank", value: (r) => r.bankName, width: 18 },
      { header: "Account number", value: (r) => r.bankAccountNumber, width: 18 },
      { header: "Bank branch", value: (r) => r.bankBranch, width: 16 },
    );
  }
  return cols;
}

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return new Response("Unauthenticated", { status: 401 });
  }
  if (!canManageStaffScoped(session.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const staff = await getStaff(session);
  const showSalary = canViewSalary(session.role);

  const buffer = await buildExportSheet("Staff", buildColumns(showSalary), staff, (r) => r.id);
  return xlsxResponse(buffer, timestampedFilename("staff"));
}
