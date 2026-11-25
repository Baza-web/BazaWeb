"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canViewCost } from "@/lib/rbac";
import { initiateEdit } from "@/lib/editRequests";
import { formatDate, formatMoney } from "@/lib/utils";
import {
  parseImportSheet,
  buildDiff,
  dateEqual,
  numberEqual,
  parseTextCell,
  parseEmailCell,
  parseDateCell,
  parseNumberCell,
  parseEnumCell,
  type ImportFieldDef,
  type DiffRow,
} from "@/lib/xlsxImport";

export type ImportEntity = "CUSTOMER" | "INVENTORY";

const displayText = (v: unknown) => (v == null || v === "" ? "—" : String(v));
const displayDate = (v: unknown) => (v ? formatDate(v as Date) : "—");
const displayMoney = (v: unknown) => (typeof v === "number" ? formatMoney(v) : "—");

type CustomerRecord = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  birthday: Date | null;
  anniversary: Date | null;
};

const CUSTOMER_FIELDS: ImportFieldDef<CustomerRecord>[] = [
  { header: "Name", dbField: "name", parse: parseTextCell, current: (r) => r.name, display: displayText },
  { header: "Phone", dbField: "phone", parse: parseTextCell, current: (r) => r.phone, display: displayText },
  { header: "Email", dbField: "email", parse: parseEmailCell, current: (r) => r.email, display: displayText },
  { header: "Address", dbField: "address", parse: parseTextCell, current: (r) => r.address, display: displayText },
  { header: "Birthday", dbField: "birthday", parse: parseDateCell, current: (r) => r.birthday, display: displayDate, equal: dateEqual },
  { header: "Anniversary", dbField: "anniversary", parse: parseDateCell, current: (r) => r.anniversary, display: displayDate, equal: dateEqual },
];

type InventoryRecord = {
  id: string;
  sku: string;
  name: string;
  category: string;
  metalType: string | null;
  metalPurity: string | null;
  grossWeightG: number | null;
  netWeightG: number | null;
  gemstoneType: string | null;
  caratWeight: number | null;
  costPrice: number;
  sellingPrice: number;
  quantity: number;
  lowStockAt: number;
  status: string;
};

const ITEM_CATEGORIES = ["RING", "NECKLACE", "EARRING", "BRACELET", "BANGLE", "PENDANT", "LOOSE_STONE", "OTHER"] as const;
const ITEM_STATUSES = ["IN_STOCK", "RESERVED", "SOLD", "IN_REPAIR", "CONSIGNMENT"] as const;

function inventoryFields(showCost: boolean): ImportFieldDef<InventoryRecord>[] {
  const fields: ImportFieldDef<InventoryRecord>[] = [
    { header: "Category", dbField: "category", parse: (c) => parseEnumCell(c, ITEM_CATEGORIES), current: (r) => r.category, display: displayText },
    { header: "Metal type", dbField: "metalType", parse: parseTextCell, current: (r) => r.metalType, display: displayText },
    { header: "Metal purity", dbField: "metalPurity", parse: parseTextCell, current: (r) => r.metalPurity, display: displayText },
    { header: "Gross weight (g)", dbField: "grossWeightG", parse: parseNumberCell, current: (r) => r.grossWeightG, display: displayText, equal: numberEqual },
    { header: "Net weight (g)", dbField: "netWeightG", parse: parseNumberCell, current: (r) => r.netWeightG, display: displayText, equal: numberEqual },
    { header: "Gemstone type", dbField: "gemstoneType", parse: parseTextCell, current: (r) => r.gemstoneType, display: displayText },
    { header: "Carat weight", dbField: "caratWeight", parse: parseNumberCell, current: (r) => r.caratWeight, display: displayText, equal: numberEqual },
  ];
  if (showCost) {
    fields.push({
      header: "Cost price",
      dbField: "costPrice",
      parse: (c) => parseNumberCell(c, { min: 0 }),
      current: (r) => r.costPrice,
      display: displayMoney,
      equal: numberEqual,
    });
  }
  fields.push(
    { header: "Selling price", dbField: "sellingPrice", parse: (c) => parseNumberCell(c, { min: 0 }), current: (r) => r.sellingPrice, display: displayMoney, equal: numberEqual },
    { header: "Quantity", dbField: "quantity", parse: (c) => parseNumberCell(c, { min: 0, integer: true }), current: (r) => r.quantity, display: displayText, equal: numberEqual },
    { header: "Low stock at", dbField: "lowStockAt", parse: (c) => parseNumberCell(c, { min: 0, integer: true }), current: (r) => r.lowStockAt, display: displayText, equal: numberEqual },
    { header: "Status", dbField: "status", parse: (c) => parseEnumCell(c, ITEM_STATUSES), current: (r) => r.status, display: displayText },
  );
  return fields;
}

/** Parses the uploaded sheet, diffs it against live records, and stashes the result as an ImportBatch for the Apply step. Owner-only, same as the rest of this page. */
export async function previewImport(entityType: ImportEntity, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!session.roles.includes("OWNER")) throw new Error("Forbidden");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a .xlsx file exported from this app first.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsedRows = await parseImportSheet(buffer);
  if (parsedRows.length === 0) throw new Error("No rows found — make sure you're uploading a file exported from this app, not a brand-new spreadsheet.");

  let diffRows: DiffRow[];
  if (entityType === "CUSTOMER") {
    const records = await db.customer.findMany({ where: { ...branchScope(session), id: { in: parsedRows.map((r) => r.id) } } });
    diffRows = buildDiff(parsedRows, new Map(records.map((r) => [r.id, r])), CUSTOMER_FIELDS, (r) => r.name);
  } else {
    const records = await db.inventoryItem.findMany({ where: { ...branchScope(session), id: { in: parsedRows.map((r) => r.id) } } });
    diffRows = buildDiff(parsedRows, new Map(records.map((r) => [r.id, r])), inventoryFields(canViewCost(session.roles)), (r) => `${r.sku} — ${r.name}`);
  }

  if (diffRows.length === 0) {
    return { batchId: null, rows: [] as DiffRow[], matched: parsedRows.length };
  }

  const batch = await db.importBatch.create({
    data: { entityType, createdById: session.staffId, rowsJson: diffRows as unknown as object },
  });
  return { batchId: batch.id, rows: diffRows, matched: parsedRows.length };
}

/** Applies the selected rows from a previously-previewed batch. Each row goes through the normal initiateEdit path, so it applies immediately — this whole page is Owner-only, so that's always the outcome. */
export async function applyImport(batchId: string, selectedIds: string[]) {
  const session = await requireSessionOrRedirect();
  if (!session.roles.includes("OWNER")) throw new Error("Forbidden");

  const batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  if (batch.createdById !== session.staffId) throw new Error("Forbidden");

  const rows = batch.rowsJson as unknown as DiffRow[];
  const selected = new Set(selectedIds);
  let applied = 0;
  for (const row of rows) {
    if (!selected.has(row.id) || row.errors.length > 0 || Object.keys(row.payload).length === 0) continue;
    await initiateEdit(
      session,
      batch.entityType as ImportEntity,
      row.id,
      row.label,
      `Bulk import: ${row.changes.map((c) => c.label).join(", ")}`,
      row.payload as Prisma.JsonObject,
    );
    applied++;
  }
  await db.importBatch.delete({ where: { id: batchId } });

  if (batch.entityType === "CUSTOMER") revalidatePath("/customers");
  else revalidatePath("/inventory");

  return { applied };
}

export async function discardImportBatch(batchId: string) {
  const session = await requireSessionOrRedirect();
  const batch = await db.importBatch.findUnique({ where: { id: batchId } });
  if (batch && batch.createdById === session.staffId) {
    await db.importBatch.delete({ where: { id: batchId } });
  }
}
