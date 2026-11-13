"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { isCompanyWide } from "@/lib/rbac";

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

const noteSchema = z.object({
  body: z.string().min(1),
  followUpAt: z.coerce.date().optional(),
});

export async function addCustomerNote(customerId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();

  const parsed = noteSchema.parse({
    body: formData.get("body"),
    followUpAt: emptyToUndefined(formData.get("followUpAt")),
  });

  await db.customerNote.create({
    data: { customerId, staffId: session.staffId, ...parsed },
  });
  revalidatePath(`/customers/${customerId}`);
}
