"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageInventory, isCompanyWide } from "@/lib/rbac";
import { saveUploadedImages } from "@/lib/uploads";

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
  });

  const files = formData.getAll("images").filter((f) => f instanceof File) as File[];
  const images = await saveUploadedImages(files, "inventory");

  const item = await db.inventoryItem.create({ data: { ...parsed, images } });
  redirect(`/inventory/${item.id}`);
}

const statusSchema = z.enum(["IN_STOCK", "RESERVED", "SOLD", "IN_REPAIR", "CONSIGNMENT"]);

export async function updateInventoryStatus(itemId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageInventory(session.role)) throw new Error("Forbidden");

  const status = statusSchema.parse(formData.get("status"));
  await db.inventoryItem.update({ where: { id: itemId }, data: { status } });
  revalidatePath(`/inventory/${itemId}`);
  revalidatePath("/inventory");
}
