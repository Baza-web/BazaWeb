"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope } from "@/lib/rbac";
import { getMailConnection, getValidMailAccessToken, sendMail } from "@/lib/googleMail";

const emailSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});

/** Sends an email to a customer from the connected Gmail account — same "anyone who can see this customer" access as adding a note (see customers/actions.ts: addCustomerNote). */
export async function sendCustomerEmail(customerId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();

  const customer = await db.customer.findFirst({ where: { id: customerId, ...branchScope(session) } });
  if (!customer) throw new Error("Forbidden");
  if (!customer.email) throw new Error("This customer has no email address on file.");

  const connection = await getMailConnection();
  if (!connection) throw new Error("Gmail isn't connected yet — ask an Owner/Admin to connect it in Settings.");

  const { subject, body } = emailSchema.parse({ subject: formData.get("subject"), body: formData.get("body") });

  const accessToken = await getValidMailAccessToken();
  if (!accessToken) throw new Error("Couldn't refresh the Gmail connection — try reconnecting it in Settings.");

  const gmailMsgId = await sendMail(accessToken, connection.googleEmail, "Baza Boutique", customer.email, subject, body);

  await db.emailLog.create({
    data: { customerId, toEmail: customer.email, subject, body, sentById: session.staffId, gmailMsgId },
  });

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/email");
  return { sent: true };
}
