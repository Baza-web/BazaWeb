"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { InventoryAttributeKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireSessionOrRedirect, type SessionPayload } from "@/lib/auth";
import { branchScope, canManageInventory, canDeleteOrRequest, canViewCost, canViewSellingPrice, isCompanyWide } from "@/lib/rbac";
import { saveUploadedImages } from "@/lib/uploads";
import { initiateDeletion } from "@/lib/deletion";
import { initiateEdit } from "@/lib/editRequests";
import { formatMoney } from "@/lib/utils";
import { parsePlainSheet, type PlainRow } from "@/lib/xlsxImport";

/**
 * Lets whoever can already create/edit inventory items add a new canonical name to one of
 * the 4 locked picklists (gemstone type, clarity, cut, certification) — "locked" means these
 * fields can't drift into free text that fragments the Reports/Dashboard breakdown, not that
 * the list is frozen: anyone with inventory access can extend it.
 */
export async function addInventoryAttributeOption(
  formData: FormData,
): Promise<{ error: string } | { id: string; name: string }> {
  const session = await requireSessionOrRedirect();
  if (!canManageInventory(session.roles)) throw new Error("Forbidden");

  const kind = formData.get("kind") as InventoryAttributeKind;
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 60) return { error: "Enter a name (1-60 characters)." };

  const existing = await db.inventoryAttributeOption.findFirst({
    where: { kind, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    revalidatePath("/inventory/new/gemstone");
    return { id: existing.id, name: existing.name };
  }

  const created = await db.inventoryAttributeOption.create({ data: { kind, name } });
  revalidatePath("/inventory/new/gemstone");
  return { id: created.id, name: created.name };
}

/** Keeps the picklists complete even if a value arrives another way (e.g. bulk import). */
async function upsertAttributeOptions(values: { kind: InventoryAttributeKind; name: string | null | undefined }[]) {
  const toAdd = values.filter(
    (v): v is { kind: InventoryAttributeKind; name: string } => typeof v.name === "string" && v.name.trim().length > 0,
  );
  if (toAdd.length === 0) return;
  await db.$transaction(
    toAdd.map((v) =>
      db.inventoryAttributeOption.upsert({
        where: { kind_name: { kind: v.kind, name: v.name } },
        update: {},
        create: { kind: v.kind, name: v.name },
      }),
    ),
  );
}

async function requireItemInScope(itemId: string, session: SessionPayload) {
  const item = await db.inventoryItem.findFirst({ where: { id: itemId, ...branchScope(session) } });
  if (!item) throw new Error("Forbidden");
  return item;
}

const numOrUndef = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.coerce.number().optional(),
);

const itemSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(2),
  category: z.enum([
    "RING",
    "NECKLACE",
    "EARRING",
    "BRACELET",
    "BANGLE",
    "PENDANT",
    "LOOSE_STONE",
    "OTHER",
  ]),
  metalType: z.string().optional(),
  metalPurity: z.string().optional(),
  grossWeightG: numOrUndef,
  netWeightG: numOrUndef,
  gemstoneType: z.string().optional(),
  caratWeight: numOrUndef,
  clarity: z.string().optional(),
  cut: z.string().optional(),
  certification: z.string().optional(),
  costPrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  quantity: z.coerce.number().int().min(1).default(1),
  lowStockAt: z.coerce.number().int().min(0).default(1),
  notes: z.string().optional(),
  branchId: z.string().min(1),
  brandId: z.string().optional(),
  driveLink: z.string().url().optional(),
});

function emptyToUndefined(value: FormDataEntryValue | null) {
  if (value === null) return undefined;
  const s = String(value);
  return s === "" ? undefined : s;
}

export async function createInventoryItem(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageInventory(session.roles)) throw new Error("Forbidden");

  const branchId = isCompanyWide(session.roles)
    ? String(formData.get("branchId"))
    : session.branchId ?? String(formData.get("branchId"));

  const parsed = itemSchema.parse({
    sku: formData.get("sku") || `SKU-${Date.now().toString(36).toUpperCase()}`,
    name: formData.get("name"),
    category: formData.get("category"),
    metalType: emptyToUndefined(formData.get("metalType")),
    metalPurity: emptyToUndefined(formData.get("metalPurity")),
    grossWeightG: formData.get("grossWeightG"),
    netWeightG: formData.get("netWeightG"),
    gemstoneType: emptyToUndefined(formData.get("gemstoneType")),
    caratWeight: formData.get("caratWeight"),
    clarity: emptyToUndefined(formData.get("clarity")),
    cut: emptyToUndefined(formData.get("cut")),
    certification: emptyToUndefined(formData.get("certification")),
    // Whoever can't view cost prices can't set one either, however the request was built —
    // the UI already hides this field for them, but don't rely on that alone.
    costPrice: canViewCost(session.roles) ? formData.get("costPrice") : 0,
    sellingPrice: formData.get("sellingPrice"),
    quantity: formData.get("quantity") || 1,
    lowStockAt: formData.get("lowStockAt") || 1,
    notes: emptyToUndefined(formData.get("notes")),
    branchId,
    brandId: emptyToUndefined(formData.get("brandId")),
    driveLink: emptyToUndefined(formData.get("driveLink")),
  });

  const files = formData.getAll("images").filter((f) => f instanceof File) as File[];
  const images = await saveUploadedImages(files, "inventory");

  const docFiles = formData.getAll("documents").filter((f) => f instanceof File) as File[];
  const documents = await saveUploadedImages(docFiles, "inventory-documents", true);

  const item = await db.inventoryItem.create({ data: { ...parsed, brandId: parsed.brandId ?? null, images, documents } });

  await upsertAttributeOptions([
    { kind: "GEMSTONE_TYPE", name: parsed.gemstoneType },
    { kind: "CLARITY", name: parsed.clarity },
    { kind: "CUT", name: parsed.cut },
    { kind: "CERTIFICATION", name: parsed.certification },
  ]);

  redirect(`/inventory/${item.id}`);
}

export async function addInventoryDocuments(itemId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageInventory(session.roles)) throw new Error("Forbidden");

  const item = await requireItemInScope(itemId, session);

  const files = formData.getAll("documents").filter((f) => f instanceof File) as File[];
  if (files.length === 0) return;

  const newDocs = await saveUploadedImages(files, "inventory-documents", true);

  await db.inventoryItem.update({
    where: { id: itemId },
    data: { documents: [...item.documents, ...newDocs] },
  });

  revalidatePath(`/inventory/${itemId}`);
}

export async function updateInventoryDriveLink(itemId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageInventory(session.roles)) throw new Error("Forbidden");
  await requireItemInScope(itemId, session);

  const raw = emptyToUndefined(formData.get("driveLink"));
  const driveLink = raw ? z.string().url().parse(raw) : null;

  await db.inventoryItem.update({ where: { id: itemId }, data: { driveLink } });
  revalidatePath(`/inventory/${itemId}`);
}

const statusSchema = z.enum(["IN_STOCK", "RESERVED", "SOLD", "IN_REPAIR", "CONSIGNMENT"]);

const STATUS_LABELS: Record<string, string> = {
  IN_STOCK: "In stock",
  RESERVED: "Reserved",
  SOLD: "Sold",
  IN_REPAIR: "In repair",
  CONSIGNMENT: "Consignment",
};

/** Owner's status change applies immediately; anyone else's is a pending request an Owner must approve first. */
export async function updateInventoryStatus(itemId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageInventory(session.roles)) throw new Error("Forbidden");
  const item = await requireItemInScope(itemId, session);

  const status = statusSchema.parse(formData.get("status"));
  if (status === item.status) return;

  await initiateEdit(
    session,
    "INVENTORY",
    itemId,
    `${item.sku} — ${item.name}`,
    `Status: ${STATUS_LABELS[item.status]} → ${STATUS_LABELS[status]}`,
    { status },
  );
  revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/inventory");
  revalidatePath("/edit-requests");
}

const editableItemSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(2),
  category: z.enum([
    "RING",
    "NECKLACE",
    "EARRING",
    "BRACELET",
    "BANGLE",
    "PENDANT",
    "LOOSE_STONE",
    "OTHER",
  ]),
  metalType: z.string().optional(),
  metalPurity: z.string().optional(),
  grossWeightG: numOrUndef,
  netWeightG: numOrUndef,
  gemstoneType: z.string().optional(),
  caratWeight: numOrUndef,
  clarity: z.string().optional(),
  cut: z.string().optional(),
  certification: z.string().optional(),
  costPrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  lowStockAt: z.coerce.number().int().min(0).default(1),
  notes: z.string().optional(),
  brandId: z.string().optional(),
});

/**
 * Edits the item's core details (not quantity or branch, which are managed by
 * sales/transfers elsewhere). Owner's edit applies immediately; anyone else's
 * is a pending request an Owner must approve before it takes effect.
 */
export async function updateInventoryItem(itemId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageInventory(session.roles)) throw new Error("Forbidden");
  const item = await requireItemInScope(itemId, session);

  const parsed = editableItemSchema.parse({
    sku: formData.get("sku"),
    name: formData.get("name"),
    category: formData.get("category"),
    metalType: emptyToUndefined(formData.get("metalType")),
    metalPurity: emptyToUndefined(formData.get("metalPurity")),
    grossWeightG: formData.get("grossWeightG"),
    netWeightG: formData.get("netWeightG"),
    gemstoneType: emptyToUndefined(formData.get("gemstoneType")),
    caratWeight: formData.get("caratWeight"),
    clarity: emptyToUndefined(formData.get("clarity")),
    cut: emptyToUndefined(formData.get("cut")),
    certification: emptyToUndefined(formData.get("certification")),
    // Whoever can't view cost prices doesn't get the field in the form at all, so there's
    // nothing in formData to read — keep the item's existing cost rather than let a missing
    // field coerce to 0 and silently wipe it.
    costPrice: canViewCost(session.roles) ? formData.get("costPrice") : item.costPrice,
    // Same reasoning as costPrice above — Creative (the one role without canViewSellingPrice)
    // can't reach this form at all today (gated by canManageInventory), but this keeps the
    // guard in place if that ever changes.
    sellingPrice: canViewSellingPrice(session.roles) ? formData.get("sellingPrice") : item.sellingPrice,
    lowStockAt: formData.get("lowStockAt") || 1,
    notes: emptyToUndefined(formData.get("notes")),
    brandId: emptyToUndefined(formData.get("brandId")),
  });

  const changeNotes: string[] = [];
  if (parsed.name !== item.name) changeNotes.push(`Name: ${item.name} → ${parsed.name}`);
  if (parsed.costPrice !== item.costPrice) changeNotes.push(`Cost: ${formatMoney(item.costPrice)} → ${formatMoney(parsed.costPrice)}`);
  if (parsed.sellingPrice !== item.sellingPrice) changeNotes.push(`Price: ${formatMoney(item.sellingPrice)} → ${formatMoney(parsed.sellingPrice)}`);
  if ((parsed.brandId ?? null) !== item.brandId) changeNotes.push("Brand changed");
  const fieldSummary = changeNotes.length > 0 ? changeNotes.join("; ") : "Updated item details";

  await initiateEdit(
    session,
    "INVENTORY",
    itemId,
    `${item.sku} — ${item.name}`,
    fieldSummary,
    { ...parsed, metalType: parsed.metalType ?? null, metalPurity: parsed.metalPurity ?? null, grossWeightG: parsed.grossWeightG ?? null, netWeightG: parsed.netWeightG ?? null, gemstoneType: parsed.gemstoneType ?? null, caratWeight: parsed.caratWeight ?? null, clarity: parsed.clarity ?? null, cut: parsed.cut ?? null, certification: parsed.certification ?? null, notes: parsed.notes ?? null, brandId: parsed.brandId ?? null },
  );

  await upsertAttributeOptions([
    { kind: "GEMSTONE_TYPE", name: parsed.gemstoneType },
    { kind: "CLARITY", name: parsed.clarity },
    { kind: "CUT", name: parsed.cut },
    { kind: "CERTIFICATION", name: parsed.certification },
  ]);

  revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/inventory");
  revalidatePath("/edit-requests");
}

/** Owner deletes immediately; Admin can only request it, pending Owner approval. Refused if the item has any sale/memo/repair history. */
export async function deleteInventoryItemPermanently(itemId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canDeleteOrRequest(session.roles)) throw new Error("Forbidden");
  const item = await requireItemInScope(itemId, session);

  const reason = String(formData.get("reason") || "").trim() || undefined;
  const result = await initiateDeletion(session, "INVENTORY", itemId, `${item.sku} — ${item.name}`, reason);
  revalidatePath("/inventory");
  return result;
}

export type BulkCreateRow = {
  rowNumber: number;
  label: string;
  errors: string[];
  data: Record<string, unknown> | null;
};

function cellText(cells: PlainRow["cells"], header: string): string {
  const v = cells[header];
  return v == null ? "" : String(v).trim();
}

function cellNumber(cells: PlainRow["cells"], header: string): { value: number | undefined; error?: string } {
  const raw = cells[header];
  if (raw == null || raw === "") return { value: undefined };
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(n)) return { value: undefined, error: `${header}: not a number` };
  return { value: n };
}

/**
 * Validates one uploaded row into a ready-to-create InventoryItem payload, or
 * a list of errors. Unlike the edit-import flow (buildDiff), every row here
 * is a brand-new record — required fields really are required, and there's
 * no "current value" to compare against.
 */
function parseInventoryCreateRow(
  row: PlainRow,
  ctx: {
    showCost: boolean;
    companyWide: boolean;
    defaultBranchId: string | null;
    branchByName: Map<string, string>;
    brandByName: Map<string, string>;
    existingSkus: Set<string>;
    seenSkusInFile: Set<string>;
  },
): BulkCreateRow {
  const errors: string[] = [];
  const name = cellText(row.cells, "Name");
  if (!name) errors.push("Name is required.");

  const categoryRaw = cellText(row.cells, "Category").toUpperCase().replace(/\s+/g, "_");
  const categories = ["RING", "NECKLACE", "EARRING", "BRACELET", "BANGLE", "PENDANT", "LOOSE_STONE", "OTHER"];
  if (!categories.includes(categoryRaw)) errors.push(`Category must be one of: ${categories.join(", ")}.`);

  let branchId = ctx.defaultBranchId;
  const branchText = cellText(row.cells, "Branch");
  if (branchText) {
    const match = ctx.branchByName.get(branchText.toLowerCase());
    if (!match) errors.push(`Branch "${branchText}" doesn't match any existing branch.`);
    else branchId = match;
  } else if (ctx.companyWide) {
    errors.push("Branch is required.");
  }

  let brandId: string | null = null;
  const brandText = cellText(row.cells, "Brand");
  if (brandText) {
    const match = ctx.brandByName.get(brandText.toLowerCase());
    if (!match) errors.push(`Brand "${brandText}" doesn't match any existing brand — add it first, or leave blank.`);
    else brandId = match;
  }

  let sku = cellText(row.cells, "SKU");
  if (sku) {
    const key = sku.toLowerCase();
    if (ctx.existingSkus.has(key)) errors.push(`SKU "${sku}" already exists — edit it from Inventory instead.`);
    else if (ctx.seenSkusInFile.has(key)) errors.push(`SKU "${sku}" appears more than once in this file.`);
    else ctx.seenSkusInFile.add(key);
  } else {
    sku = `SKU-${Date.now().toString(36).toUpperCase()}-${row.rowNumber}`;
  }

  const sellingPrice = cellNumber(row.cells, "Selling price");
  if (sellingPrice.error) errors.push(sellingPrice.error);
  else if (sellingPrice.value === undefined) errors.push("Selling price is required.");
  else if (sellingPrice.value < 0) errors.push("Selling price can't be negative.");

  const costPrice = ctx.showCost ? cellNumber(row.cells, "Cost price") : { value: 0 };
  if (costPrice.error) errors.push(costPrice.error);

  const grossWeightG = cellNumber(row.cells, "Gross weight (g)");
  if (grossWeightG.error) errors.push(grossWeightG.error);
  const netWeightG = cellNumber(row.cells, "Net weight (g)");
  if (netWeightG.error) errors.push(netWeightG.error);
  const caratWeight = cellNumber(row.cells, "Carat weight");
  if (caratWeight.error) errors.push(caratWeight.error);

  const quantity = cellNumber(row.cells, "Quantity");
  if (quantity.error) errors.push(quantity.error);
  const lowStockAt = cellNumber(row.cells, "Low stock at");
  if (lowStockAt.error) errors.push(lowStockAt.error);

  const label = sku && name ? `${sku} — ${name}` : name || sku || `Row ${row.rowNumber}`;
  if (errors.length > 0 || !branchId) {
    if (!branchId && errors.length === 0) errors.push("Branch is required.");
    return { rowNumber: row.rowNumber, label, errors, data: null };
  }

  return {
    rowNumber: row.rowNumber,
    label,
    errors: [],
    data: {
      sku,
      name,
      category: categoryRaw,
      branchId,
      brandId,
      metalType: cellText(row.cells, "Metal type") || null,
      metalPurity: cellText(row.cells, "Metal purity") || null,
      grossWeightG: grossWeightG.value ?? null,
      netWeightG: netWeightG.value ?? null,
      gemstoneType: cellText(row.cells, "Gemstone type") || null,
      caratWeight: caratWeight.value ?? null,
      clarity: cellText(row.cells, "Clarity") || null,
      cut: cellText(row.cells, "Cut") || null,
      certification: cellText(row.cells, "Certification") || null,
      costPrice: costPrice.value ?? 0,
      sellingPrice: sellingPrice.value ?? 0,
      quantity: quantity.value ?? 1,
      lowStockAt: lowStockAt.value ?? 1,
      notes: cellText(row.cells, "Notes") || null,
    },
  };
}

/** Parses an uploaded "add new items" sheet and validates each row, without creating anything yet. */
export async function previewBulkCreateInventory(formData: FormData): Promise<{ batchId: string | null; rows: BulkCreateRow[] }> {
  const session = await requireSessionOrRedirect();
  if (!canManageInventory(session.roles)) throw new Error("Forbidden");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a .xlsx file first.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsedRows = await parsePlainSheet(buffer);
  if (parsedRows.length === 0) throw new Error("No rows found in that file.");

  const [branches, brands, existing] = await Promise.all([
    db.branch.findMany({ select: { id: true, name: true } }),
    db.brand.findMany({ where: { active: true }, select: { id: true, name: true } }),
    db.inventoryItem.findMany({ select: { sku: true } }),
  ]);

  const ctx = {
    showCost: canViewCost(session.roles),
    companyWide: isCompanyWide(session.roles),
    defaultBranchId: session.branchId,
    branchByName: new Map(branches.map((b) => [b.name.toLowerCase(), b.id])),
    brandByName: new Map(brands.map((b) => [b.name.toLowerCase(), b.id])),
    existingSkus: new Set(existing.map((i) => i.sku.toLowerCase())),
    seenSkusInFile: new Set<string>(),
  };

  const rows = parsedRows.map((row) => parseInventoryCreateRow(row, ctx));
  const batch = await db.importBatch.create({
    data: { entityType: "INVENTORY_CREATE", createdById: session.staffId, rowsJson: rows as unknown as object },
  });
  return { batchId: batch.id, rows };
}

/** Creates the selected, error-free rows from a previewed bulk-create batch. */
export async function applyBulkCreateInventory(batchId: string, selectedRowNumbers: number[]) {
  const session = await requireSessionOrRedirect();
  if (!canManageInventory(session.roles)) throw new Error("Forbidden");

  const batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  if (batch.createdById !== session.staffId || batch.entityType !== "INVENTORY_CREATE") throw new Error("Forbidden");

  const rows = batch.rowsJson as unknown as BulkCreateRow[];
  const selected = new Set(selectedRowNumbers);
  const toCreate = rows.filter((r) => selected.has(r.rowNumber) && r.errors.length === 0 && r.data);

  if (toCreate.length > 0) {
    await db.inventoryItem.createMany({ data: toCreate.map((r) => r.data) as Prisma.InventoryItemCreateManyInput[] });
    await upsertAttributeOptions(
      toCreate.flatMap((r) => {
        const d = r.data as Record<string, unknown>;
        return [
          { kind: "GEMSTONE_TYPE" as const, name: d.gemstoneType as string | null },
          { kind: "CLARITY" as const, name: d.clarity as string | null },
          { kind: "CUT" as const, name: d.cut as string | null },
          { kind: "CERTIFICATION" as const, name: d.certification as string | null },
        ];
      }),
    );
  }
  await db.importBatch.delete({ where: { id: batchId } });
  revalidatePath("/inventory");
  return { created: toCreate.length };
}
