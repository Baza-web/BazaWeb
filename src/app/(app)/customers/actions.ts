"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, isCompanyWide, canDeleteOrRequestCustomer, canManageRewardProgram } from "@/lib/rbac";
import { initiateEdit } from "@/lib/editRequests";
import { initiateDeletion } from "@/lib/deletion";
import { redeemRewards, setRewardRate } from "@/lib/rewards";
import { parsePlainSheet, type PlainRow } from "@/lib/xlsxImport";
import { customerBulkCreateHeaders } from "@/lib/bulkCreateColumns";
import type { CustomerStage, Prisma } from "@prisma/client";

const STAGE_LABELS: Record<CustomerStage, string> = { LEAD: "Lead", PROSPECT: "Prospect", CUSTOMER: "Customer" };

function emptyToUndefined(value: FormDataEntryValue | null) {
  if (value === null) return undefined;
  const s = String(value);
  return s === "" ? undefined : s;
}

const customerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  birthday: z.coerce.date().optional(),
  anniversary: z.coerce.date().optional(),
  branchId: z.string().min(1),
});

export async function createCustomer(formData: FormData) {
  const session = await requireSessionOrRedirect();

  const branchId = isCompanyWide(session.roles)
    ? String(formData.get("branchId"))
    : session.branchId ?? String(formData.get("branchId"));

  const parsed = customerSchema.parse({
    name: formData.get("name"),
    phone: emptyToUndefined(formData.get("phone")),
    email: emptyToUndefined(formData.get("email")),
    address: emptyToUndefined(formData.get("address")),
    birthday: emptyToUndefined(formData.get("birthday")),
    anniversary: emptyToUndefined(formData.get("anniversary")),
    branchId,
  });

  const customer = await db.customer.create({ data: parsed });
  redirect(`/customers/${customer.id}`);
}

const editSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  birthday: z.coerce.date().optional(),
  anniversary: z.coerce.date().optional(),
});

/** Owner's and Admin's edits apply immediately; anyone else's (Sales staff) is a pending request an Admin or Owner must approve first. */
export async function updateCustomer(customerId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const customer = await db.customer.findFirst({ where: { id: customerId, ...branchScope(session) } });
  if (!customer) throw new Error("Forbidden");

  const parsed = editSchema.parse({
    name: formData.get("name"),
    phone: emptyToUndefined(formData.get("phone")),
    email: emptyToUndefined(formData.get("email")),
    address: emptyToUndefined(formData.get("address")),
    birthday: emptyToUndefined(formData.get("birthday")),
    anniversary: emptyToUndefined(formData.get("anniversary")),
  });

  await initiateEdit(session, "CUSTOMER", customerId, customer.name, "Updated contact details", {
    name: parsed.name,
    phone: parsed.phone ?? null,
    email: parsed.email ?? null,
    address: parsed.address ?? null,
    birthday: parsed.birthday ? parsed.birthday.toISOString() : null,
    anniversary: parsed.anniversary ? parsed.anniversary.toISOString() : null,
  });
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/edit-requests");
}

const noteSchema = z.object({
  body: z.string().min(1),
  followUpAt: z.coerce.date().optional(),
});

export async function addCustomerNote(customerId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();

  const customer = await db.customer.findFirst({
    where: { id: customerId, ...branchScope(session) },
  });
  if (!customer) throw new Error("Forbidden");

  const parsed = noteSchema.parse({
    body: formData.get("body"),
    followUpAt: emptyToUndefined(formData.get("followUpAt")),
  });

  await db.customerNote.create({
    data: { customerId, staffId: session.staffId, ...parsed },
  });
  revalidatePath(`/customers/${customerId}`);
}

export async function logCustomerActivity(customerId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const customer = await db.customer.findFirst({ where: { id: customerId, ...branchScope(session) } });
  if (!customer) throw new Error("Forbidden");

  const type = String(formData.get("type") || "");
  if (type !== "CALL" && type !== "VISIT") throw new Error("Invalid activity type");
  const note = String(formData.get("note") || "").trim();
  if (!note) throw new Error("A note is required");

  await db.customerActivity.create({
    data: { customerId, type, note, staffId: session.staffId },
  });
  revalidatePath(`/customers/${customerId}`);
}

export async function toggleFollowUpDone(customerId: string, noteId: string, done: boolean, formData: FormData) {
  void formData; // bound params carry the real input; a <form action> still needs this last arg
  const session = await requireSessionOrRedirect();
  const customer = await db.customer.findFirst({ where: { id: customerId, ...branchScope(session) } });
  if (!customer) throw new Error("Forbidden");

  await db.customerNote.update({ where: { id: noteId }, data: { followUpDone: done } });
  revalidatePath(`/customers/${customerId}`);
}

export async function updateCustomerTags(customerId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const customer = await db.customer.findFirst({ where: { id: customerId, ...branchScope(session) } });
  if (!customer) throw new Error("Forbidden");

  const tags = String(formData.get("tags") || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  await db.customer.update({ where: { id: customerId }, data: { tags } });
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}

export async function updateCustomerStage(customerId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const customer = await db.customer.findFirst({ where: { id: customerId, ...branchScope(session) } });
  if (!customer) throw new Error("Forbidden");

  const stage = String(formData.get("stage") || "") as CustomerStage;
  if (!["LEAD", "PROSPECT", "CUSTOMER"].includes(stage)) throw new Error("Invalid stage");
  if (stage === customer.stage) return;

  await db.$transaction([
    db.customer.update({ where: { id: customerId }, data: { stage } }),
    db.customerActivity.create({
      data: {
        customerId,
        type: "STAGE_CHANGE",
        note: `${STAGE_LABELS[customer.stage]} → ${STAGE_LABELS[stage]}`,
        staffId: session.staffId,
      },
    }),
  ]);
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
}

/** Same branch-scope level as adding a note/tag — redeeming a customer's existing reward balance at checkout is a routine action, not a sensitive one. The amount itself is validated against the live balance inside redeemRewards. */
export async function redeemRewardsAction(customerId: string, formData: FormData): Promise<{ error?: string }> {
  const session = await requireSessionOrRedirect();
  const customer = await db.customer.findFirst({ where: { id: customerId, ...branchScope(session) } });
  if (!customer) return { error: "Forbidden" };

  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") || "").trim() || undefined;
  if (!Number.isFinite(amount)) return { error: "Enter a valid amount." };

  try {
    await redeemRewards(customerId, amount, session.staffId, note);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't redeem rewards." };
  }

  revalidatePath(`/customers/${customerId}`);
  return {};
}

export async function setRewardRateAction(formData: FormData): Promise<void> {
  const session = await requireSessionOrRedirect();
  if (!canManageRewardProgram(session.roles)) throw new Error("Forbidden");

  const rewardPer100k = Number(formData.get("rewardPer100k"));
  if (!Number.isFinite(rewardPer100k) || rewardPer100k < 0) throw new Error("Enter a valid, non-negative amount.");
  const active = formData.get("active") === "on";

  await setRewardRate(rewardPer100k, active);
  revalidatePath("/customers");
}

/** Owner and Admin delete immediately; Sales staff can only request it, pending Admin/Owner approval. Refused if the customer has any sale/repair history. */
export async function deleteCustomerPermanently(customerId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canDeleteOrRequestCustomer(session.roles)) throw new Error("Forbidden");

  const customer = await db.customer.findFirst({ where: { id: customerId, ...branchScope(session) } });
  if (!customer) throw new Error("Forbidden");

  const reason = String(formData.get("reason") || "").trim() || undefined;
  const result = await initiateDeletion(session, "CUSTOMER", customerId, customer.name, reason);
  revalidatePath("/customers");
  revalidatePath("/deletion-requests");
  return result;
}

export type BulkCreateCustomerRow = {
  rowNumber: number;
  label: string;
  errors: string[];
  data: Record<string, unknown> | null;
};

function cellText(cells: PlainRow["cells"], header: string): string {
  const v = cells[header];
  return v == null ? "" : String(v).trim();
}

function cellDate(cells: PlainRow["cells"], header: string): { value: Date | undefined; error?: string } {
  const raw = cells[header];
  if (raw == null || raw === "") return { value: undefined };
  const d = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(d.getTime())) return { value: undefined, error: `${header}: not a valid date` };
  return { value: d };
}

function parseCustomerCreateRow(
  row: PlainRow,
  ctx: { companyWide: boolean; defaultBranchId: string | null; branchByName: Map<string, string> },
): BulkCreateCustomerRow {
  const errors: string[] = [];
  const name = cellText(row.cells, "Name");
  if (!name || name.length < 2) errors.push("Name is required (at least 2 characters).");

  const email = cellText(row.cells, "Email");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push("Email is not a valid address.");

  let branchId = ctx.defaultBranchId;
  const branchText = cellText(row.cells, "Branch");
  if (branchText) {
    const match = ctx.branchByName.get(branchText.toLowerCase());
    if (!match) errors.push(`Branch "${branchText}" doesn't match any existing branch.`);
    else branchId = match;
  } else if (ctx.companyWide) {
    errors.push("Branch is required.");
  }

  const birthday = cellDate(row.cells, "Birthday");
  if (birthday.error) errors.push(birthday.error);
  const anniversary = cellDate(row.cells, "Anniversary");
  if (anniversary.error) errors.push(anniversary.error);

  const label = name || `Row ${row.rowNumber}`;
  if (errors.length > 0 || !branchId) {
    if (!branchId && errors.length === 0) errors.push("Branch is required.");
    return { rowNumber: row.rowNumber, label, errors, data: null };
  }

  return {
    rowNumber: row.rowNumber,
    label,
    errors: [],
    data: {
      name,
      phone: cellText(row.cells, "Phone") || null,
      email: email || null,
      address: cellText(row.cells, "Address") || null,
      birthday: birthday.value ?? null,
      anniversary: anniversary.value ?? null,
      branchId,
    },
  };
}

/** Parses an uploaded "add new customers" sheet and validates each row, without creating anything yet. Same audience as the single Add-customer form — any logged-in staff member. */
export async function previewBulkCreateCustomers(formData: FormData): Promise<{ batchId: string | null; rows: BulkCreateCustomerRow[] }> {
  const session = await requireSessionOrRedirect();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a .xlsx file first.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const parsedRows = await parsePlainSheet(buffer, customerBulkCreateHeaders());
  if (parsedRows.length === 0) throw new Error("No rows found in that file.");

  const branches = await db.branch.findMany({ select: { id: true, name: true } });
  const ctx = {
    companyWide: isCompanyWide(session.roles),
    defaultBranchId: session.branchId,
    branchByName: new Map(branches.map((b) => [b.name.toLowerCase(), b.id])),
  };

  const rows = parsedRows.map((row) => parseCustomerCreateRow(row, ctx));
  const batch = await db.importBatch.create({
    data: { entityType: "CUSTOMER_CREATE", createdById: session.staffId, rowsJson: rows as unknown as object },
  });
  return { batchId: batch.id, rows };
}

/** Creates the selected, error-free rows from a previewed bulk-create batch. */
export async function applyBulkCreateCustomers(batchId: string, selectedRowNumbers: number[]) {
  const session = await requireSessionOrRedirect();

  const batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId } });
  if (batch.createdById !== session.staffId || batch.entityType !== "CUSTOMER_CREATE") throw new Error("Forbidden");

  const rows = batch.rowsJson as unknown as BulkCreateCustomerRow[];
  const selected = new Set(selectedRowNumbers);
  const toCreate = rows.filter((r) => selected.has(r.rowNumber) && r.errors.length === 0 && r.data);

  if (toCreate.length > 0) {
    await db.customer.createMany({ data: toCreate.map((r) => r.data) as Prisma.CustomerCreateManyInput[] });
  }
  await db.importBatch.delete({ where: { id: batchId } });
  revalidatePath("/customers");
  return { created: toCreate.length };
}
