"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, isCompanyWide, canDeleteOrRequest } from "@/lib/rbac";
import { initiateEdit } from "@/lib/editRequests";
import { initiateDeletion } from "@/lib/deletion";

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

  const branchId = isCompanyWide(session.role)
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

/** Owner's edit applies immediately; anyone else's is a pending request an Owner must approve first. */
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

/** Owner deletes immediately; Admin can only request it, pending Owner approval. Refused if the customer has any sale/repair history. */
export async function deleteCustomerPermanently(customerId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canDeleteOrRequest(session.role)) throw new Error("Forbidden");

  const customer = await db.customer.findFirst({ where: { id: customerId, ...branchScope(session) } });
  if (!customer) throw new Error("Forbidden");

  const reason = String(formData.get("reason") || "").trim() || undefined;
  const result = await initiateDeletion(session, "CUSTOMER", customerId, customer.name, reason);
  revalidatePath("/customers");
  revalidatePath("/deletion-requests");
  return result;
}
