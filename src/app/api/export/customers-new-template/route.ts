import { requireSession } from "@/lib/auth";
import { customerBulkCreateHeaders } from "@/lib/bulkCreateColumns";
import { buildExportSheet, xlsxResponse, type ExportColumn } from "@/lib/xlsxExport";

const EXAMPLE_ROW: Record<string, string> = {
  Name: "Nimal Perera",
  Phone: "0771234567",
  Email: "nimal@example.com",
  Address: "12 Galle Road, Colombo",
  Birthday: "1990-05-14",
  Anniversary: "",
  Branch: "Main Branch",
};

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return new Response("Unauthenticated", { status: 401 });
  }

  const headers = customerBulkCreateHeaders();
  const columns: ExportColumn<Record<string, string>>[] = headers.map((h) => ({
    header: h,
    width: 18,
    value: (row) => row[h] ?? "",
  }));

  const buffer = await buildExportSheet("New customers", columns, [EXAMPLE_ROW]);
  return xlsxResponse(buffer, "customers-new-template.xlsx");
}
