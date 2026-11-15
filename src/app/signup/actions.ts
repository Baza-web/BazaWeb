"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSessionCookie, hashPassword } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { TRIAL_DAYS } from "@/lib/plans";

const KNOWN_DEFAULT_PASSWORDS = new Set(["password", "password123", "owner123", "admin123", "12345678"]);

const schema = z.object({
  businessName: z.string().min(2, "Enter your business name"),
  ownerName: z.string().min(2, "Enter your name"),
  email: z.string().email("Enter a valid email"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .refine((p) => !KNOWN_DEFAULT_PASSWORDS.has(p.toLowerCase()), "Choose a less guessable password"),
});

/** Appends -2, -3, ... until the slug is free. Organization.slug is globally unique (it's the subdomain). */
async function uniqueSlug(base: string) {
  const root = slugify(base) || "business";
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const taken = await db.organization.findUnique({ where: { slug: candidate } });
    if (!taken) return candidate;
  }
}

export async function signUp(formData: FormData) {
  const parsed = schema.safeParse({
    businessName: formData.get("businessName"),
    ownerName: formData.get("ownerName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/signup?error=" + encodeURIComponent(parsed.error.issues[0].message));
  }

  const slug = await uniqueSlug(parsed.data.businessName);
  const passwordHash = await hashPassword(parsed.data.password);

  let organization, staff;
  try {
    ({ organization, staff } = await db.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: parsed.data.businessName,
          slug,
          status: "TRIAL",
          plan: "trial",
          trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
        },
      });
      const branch = await tx.branch.create({
        data: { name: "Main Branch", isMain: true, organizationId: organization.id },
      });
      const staff = await tx.staff.create({
        data: {
          name: parsed.data.ownerName,
          email: parsed.data.email.toLowerCase(),
          passwordHash,
          role: "OWNER",
          branchId: branch.id,
          organizationId: organization.id,
        },
      });
      return { organization, staff };
    }));
  } catch (err) {
    console.error("Signup failed:", err);
    redirect("/signup?error=" + encodeURIComponent("Something went wrong creating your account — please try again."));
  }

  await createSessionCookie({
    staffId: staff.id,
    organizationId: organization.id,
    name: staff.name,
    email: staff.email,
    role: staff.role,
    branchId: staff.branchId,
  });

  // TODO once real subdomains are wired to a wildcard DNS entry + the
  // session cookie's Domain is widened to the shared root domain: redirect
  // to `https://${slug}.${APP_DOMAIN}/dashboard` instead, so future visits
  // land straight on this tenant's own subdomain.
  redirect("/dashboard");
}
