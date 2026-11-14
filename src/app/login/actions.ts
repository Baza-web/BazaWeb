"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSessionCookie, verifyPassword } from "@/lib/auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function login(formData: FormData) {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/login?error=" + encodeURIComponent("Enter a valid email and password."));
  }

  const staff = await db.staff.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!staff || !staff.active) {
    redirect("/login?error=" + encodeURIComponent("No active account found with that email."));
  }

  const valid = await verifyPassword(parsed.data.password, staff.passwordHash);
  if (!valid) {
    redirect("/login?error=" + encodeURIComponent("Incorrect password."));
  }

  await createSessionCookie({
    staffId: staff.id,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    branchId: staff.branchId,
  });

  redirect("/dashboard");
}
