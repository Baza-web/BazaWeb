"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect, type SessionPayload } from "@/lib/auth";
import { branchScope, canManageInventory, canDeleteOrRequest, isCompanyWide } from "@/lib/rbac";
import { saveUploadedImages } from "@/lib/uploads";
import { initiateDeletion } from "@/lib/deletion";
import { initiateEdit } from "@/lib/editRequests";
import { formatMoney } from "@/lib/utils";

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
  if (!canManageInventory(session.role)) throw new Error("Forbidden");

  const branchId = isCompanyWide(session.role)
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
    costPrice: formData.get("costPrice"),
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
  redirect(`/inventory/${item.id}`);
}

export async function addInventoryDocuments(itemId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageInventory(session.role)) throw new Error("Forbidden");

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
  if (!canManageInventory(session.role)) throw new Error("Forbidden");
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
  if (!canManageInventory(session.role)) throw new Error("Forbidden");
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
  if (!canManageInventory(session.role)) throw new Error("Forbidden");
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
    costPrice: formData.get("costPrice"),
    sellingPrice: formData.get("sellingPrice"),
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
  revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/inventory");
  revalidatePath("/edit-requests");
}

/** Owner deletes immediately; Admin can only request it, pending Owner approval. Refused if the item has any sale/memo/repair history. */
export async function deleteInventoryItemPermanently(itemId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canDeleteOrRequest(session.role)) throw new Error("Forbidden");
  const item = await requireItemInScope(itemId, session);

  const reason = String(formData.get("reason") || "").trim() || undefined;
  const result = await initiateDeletion(session, "INVENTORY", itemId, `${item.sku} — ${item.name}`, reason);
  revalidatePath("/inventory");
  return result;
}
