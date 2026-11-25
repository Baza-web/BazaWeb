"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect, hashPassword } from "@/lib/auth";
import type { Role } from "@prisma/client";
import {
  canManageStaffScoped,
  canManageStaff,
  canViewSalary,
  isCompanyWide,
  MANAGER_GRANTABLE_ROLES,
  ADMIN_GRANTABLE_ROLES,
  ROLE_LABELS,
} from "@/lib/rbac";
import { initiateDeletion } from "@/lib/deletion";
import { initiateEdit } from "@/lib/editRequests";
import { saveUploadedImages } from "@/lib/uploads";
import { formatMoney } from "@/lib/utils";

function emptyToUndefined(value: FormDataEntryValue | null) {
  if (value === null) return undefined;
  const s = String(value);
  return s === "" ? undefined : s;
}

const DEFAULT_ONBOARDING_TASKS = [
  "Collect ID/NIC copy",
  "Collect bank details for payroll",
  "Issue uniform / ID badge",
  "Walk through POS, attendance clock-in, and the app",
  "Add to the relevant Staff Group",
];

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT", "CRAFTSMAN", "CREATIVE"]),
  branchId: z.string().min(1),
});

export async function createStaff(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaffScoped(session.roles)) throw new Error("Forbidden");

  const companyWide = isCompanyWide(session.roles);
  const branchId = companyWide ? String(formData.get("branchId")) : session.branchId ?? "";

  const parsed = createSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone") || undefined,
    password: formData.get("password"),
    role: formData.get("role"),
    branchId,
  });

  // A Branch Manager may only grant branch-level roles, for their own branch —
  // never a company-wide role (Owner/Admin/Accountant) and never another branch.
  if (!companyWide) {
    if (!MANAGER_GRANTABLE_ROLES.includes(parsed.role)) throw new Error("Forbidden");
    if (parsed.branchId !== session.branchId) throw new Error("Forbidden");
  }

  const passwordHash = await hashPassword(parsed.password);

  const staff = await db.staff.create({
    data: {
      name: parsed.name,
      email: parsed.email.toLowerCase(),
      phone: parsed.phone,
      role: parsed.role,
      branchId: parsed.branchId,
      passwordHash,
    },
  });

  await db.onboardingTask.createMany({
    data: DEFAULT_ONBOARDING_TASKS.map((label) => ({ staffId: staff.id, label })),
  });

  redirect("/staff");
}

export async function toggleStaffActive(staffId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaffScoped(session.roles)) throw new Error("Forbidden");
  if (staffId === session.staffId) throw new Error("You can't deactivate your own account.");

  const staff = await db.staff.findUniqueOrThrow({ where: { id: staffId } });

  if (!isCompanyWide(session.roles)) {
    if (staff.branchId !== session.branchId) throw new Error("Forbidden");
    if (!MANAGER_GRANTABLE_ROLES.includes(staff.role)) throw new Error("Forbidden");
  }

  await db.staff.update({ where: { id: staffId }, data: { active: !staff.active } });
  revalidatePath("/staff");
}

/**
 * Owner deletes a staff account immediately; Admin can only request it — a
 * different Owner must approve. Nothing is ever truly erased (their past
 * sales/attendance/tasks must stay attributable), so this wipes their login
 * and personal details and hides them everywhere instead of removing the row.
 */
export async function deleteStaffPermanently(staffId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaff(session.roles)) throw new Error("Forbidden");
  if (staffId === session.staffId) throw new Error("You can't delete your own account.");

  const staff = await db.staff.findUniqueOrThrow({ where: { id: staffId } });
  if (staff.deletedAt) throw new Error("This account has already been deleted.");

  if (staff.role === "OWNER") {
    const otherOwners = await db.staff.count({ where: { role: "OWNER", deletedAt: null, id: { not: staffId } } });
    if (otherOwners === 0) throw new Error("You can't delete the only remaining Owner account.");
  }

  const reason = String(formData.get("reason") || "").trim() || undefined;
  const result = await initiateDeletion(session, "STAFF", staffId, `${staff.name} (${staff.email})`, reason);
  revalidatePath("/staff");
  return result;
}

const hrSchema = z.object({
  phone: z.string().optional(),
  nic: z.string().optional(),
  dateOfBirth: z.coerce.date().optional(),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  dateOfJoining: z.coerce.date().optional(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT"]).optional(),
});

/**
 * Owner/Admin/Manager can update a staff member's general HR details (never
 * salary/bank — see updateStaffPay). Owner's edit applies immediately;
 * anyone else's is a pending request a different Owner must approve first.
 */
export async function updateStaffProfile(staffId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaffScoped(session.roles)) throw new Error("Forbidden");

  const staff = await db.staff.findUniqueOrThrow({ where: { id: staffId } });
  if (!isCompanyWide(session.roles) && staff.branchId !== session.branchId) throw new Error("Forbidden");

  const parsed = hrSchema.parse({
    phone: emptyToUndefined(formData.get("phone")),
    nic: emptyToUndefined(formData.get("nic")),
    dateOfBirth: formData.get("dateOfBirth") || undefined,
    address: emptyToUndefined(formData.get("address")),
    emergencyContactName: emptyToUndefined(formData.get("emergencyContactName")),
    emergencyContactPhone: emptyToUndefined(formData.get("emergencyContactPhone")),
    dateOfJoining: formData.get("dateOfJoining") || undefined,
    employmentType: emptyToUndefined(formData.get("employmentType")),
  });

  await initiateEdit(session, "STAFF", staffId, staff.name, "Updated HR profile details", {
    phone: parsed.phone ?? null,
    nic: parsed.nic ?? null,
    dateOfBirth: parsed.dateOfBirth ? parsed.dateOfBirth.toISOString() : null,
    address: parsed.address ?? null,
    emergencyContactName: parsed.emergencyContactName ?? null,
    emergencyContactPhone: parsed.emergencyContactPhone ?? null,
    dateOfJoining: parsed.dateOfJoining ? parsed.dateOfJoining.toISOString() : null,
    employmentType: parsed.employmentType ?? null,
  });
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/edit-requests");
}

/**
 * Owner/Admin only. An Admin can never set someone to Owner — only an existing Owner can
 * create another Owner-level account, so that privilege can't be granted from a lower role.
 *
 * Returns { error } instead of throwing for the validation case: Next.js redacts a thrown
 * Error's message in production builds, so the real reason would never reach the Owner/Admin
 * on the live site even though it works fine in local dev (see deleteBranch for the same fix).
 */
export async function updateStaffRole(
  staffId: string,
  formData: FormData,
): Promise<{ error: string } | { status: "applied" | "requested" }> {
  const session = await requireSessionOrRedirect();
  if (!canManageStaff(session.roles)) throw new Error("Forbidden");

  const requestedRole = String(formData.get("role")) as Role;
  const isOwner = session.roles.includes("OWNER");
  const assignableRoles = isOwner ? (Object.keys(ROLE_LABELS) as Role[]) : ADMIN_GRANTABLE_ROLES;
  if (!assignableRoles.includes(requestedRole)) {
    return {
      error: !isOwner && requestedRole === "OWNER" ? "Only an Owner can promote someone to Owner." : "Invalid role.",
    };
  }

  const staff = await db.staff.findUniqueOrThrow({ where: { id: staffId } });
  if (staff.role === requestedRole) return { status: "applied" };

  const result = await initiateEdit(
    session,
    "STAFF",
    staffId,
    staff.name,
    `Role: ${ROLE_LABELS[staff.role]} → ${ROLE_LABELS[requestedRole]}`,
    { role: requestedRole },
  );
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/staff");
  revalidatePath("/edit-requests");
  return result;
}

const MAX_ADDITIONAL_ROLES = 2;

/**
 * Owner/Admin only — same privilege-escalation limit as updateStaffRole: an Admin can
 * never grant Owner, even as an extra role. Up to 2 extras on top of the primary role,
 * so a staff member can hold up to 3 roles total (e.g. Craftsman primary + Sales extra).
 * Permissions become the union of all of them — see src/lib/rbac.ts.
 */
export async function updateStaffAdditionalRoles(
  staffId: string,
  formData: FormData,
): Promise<{ error: string } | { status: "applied" | "requested" }> {
  const session = await requireSessionOrRedirect();
  if (!canManageStaff(session.roles)) throw new Error("Forbidden");

  const requested = formData.getAll("additionalRoles").map((v) => String(v)) as Role[];
  const isOwner = session.roles.includes("OWNER");
  const assignableRoles = isOwner ? (Object.keys(ROLE_LABELS) as Role[]) : ADMIN_GRANTABLE_ROLES;

  const invalid = requested.find((r) => !assignableRoles.includes(r));
  if (invalid) {
    return {
      error: !isOwner && invalid === "OWNER" ? "Only an Owner can grant Owner as an extra role." : "Invalid role.",
    };
  }

  const staff = await db.staff.findUniqueOrThrow({ where: { id: staffId } });
  // The primary role already covers itself — drop it if it was also ticked as an "extra".
  const additionalRoles = Array.from(new Set(requested.filter((r) => r !== staff.role)));
  if (additionalRoles.length > MAX_ADDITIONAL_ROLES) {
    return { error: `Choose at most ${MAX_ADDITIONAL_ROLES} extra roles.` };
  }

  const unchanged =
    additionalRoles.length === staff.additionalRoles.length &&
    additionalRoles.every((r) => staff.additionalRoles.includes(r));
  if (unchanged) return { status: "applied" };

  const result = await initiateEdit(
    session,
    "STAFF",
    staffId,
    staff.name,
    `Extra roles: ${additionalRoles.length > 0 ? additionalRoles.map((r) => ROLE_LABELS[r]).join(", ") : "none"}`,
    { additionalRoles },
  );
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/staff");
  revalidatePath("/edit-requests");
  return result;
}

const paySchema = z.object({
  baseSalary: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().min(0).optional()),
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankBranch: z.string().optional(),
});

/** Owner/Admin only — salary and bank details are more sensitive than the rest of the profile. */
export async function updateStaffPay(staffId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canViewSalary(session.roles)) throw new Error("Forbidden");

  const staff = await db.staff.findUniqueOrThrow({ where: { id: staffId } });
  const parsed = paySchema.parse({
    baseSalary: formData.get("baseSalary"),
    bankName: emptyToUndefined(formData.get("bankName")),
    bankAccountNumber: emptyToUndefined(formData.get("bankAccountNumber")),
    bankBranch: emptyToUndefined(formData.get("bankBranch")),
  });

  const fieldSummary =
    parsed.baseSalary !== staff.baseSalary
      ? `Base salary: ${staff.baseSalary != null ? formatMoney(staff.baseSalary) : "—"} → ${parsed.baseSalary != null ? formatMoney(parsed.baseSalary) : "—"}`
      : "Updated salary/bank details";

  await initiateEdit(session, "STAFF", staffId, staff.name, fieldSummary, {
    baseSalary: parsed.baseSalary ?? null,
    bankName: parsed.bankName ?? null,
    bankAccountNumber: parsed.bankAccountNumber ?? null,
    bankBranch: parsed.bankBranch ?? null,
  });
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/edit-requests");
}

const passwordSchema = z.object({
  password: z.string().min(8),
});

/** Owner/Admin only — resets a staff member's login password. Both apply immediately; anyone else requesting a Staff edit still queues, same as salary. */
export async function setStaffPassword(staffId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaff(session.roles)) throw new Error("Forbidden");

  const staff = await db.staff.findUniqueOrThrow({ where: { id: staffId } });
  const { password } = passwordSchema.parse({ password: formData.get("password") });
  const passwordHash = await hashPassword(password);

  await initiateEdit(session, "STAFF", staffId, staff.name, "Reset login password", { passwordHash });
  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/edit-requests");
}

export async function addStaffDocuments(staffId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaffScoped(session.roles)) throw new Error("Forbidden");

  const staff = await db.staff.findUniqueOrThrow({ where: { id: staffId } });
  if (!isCompanyWide(session.roles) && staff.branchId !== session.branchId) throw new Error("Forbidden");

  const files = formData.getAll("documents").filter((f) => f instanceof File) as File[];
  if (files.length === 0) return;

  const newDocs = await saveUploadedImages(files, "staff-documents", true);
  await db.staff.update({ where: { id: staffId }, data: { documents: [...staff.documents, ...newDocs] } });
  revalidatePath(`/staff/${staffId}`);
}

export async function toggleOnboardingTask(taskId: string) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaffScoped(session.roles)) throw new Error("Forbidden");

  const task = await db.onboardingTask.findUniqueOrThrow({ where: { id: taskId }, include: { staff: true } });
  if (!isCompanyWide(session.roles) && task.staff.branchId !== session.branchId) throw new Error("Forbidden");

  await db.onboardingTask.update({
    where: { id: taskId },
    data: { completed: !task.completed, completedAt: !task.completed ? new Date() : null },
  });
  revalidatePath(`/staff/${task.staffId}`);
}

const reviewSchema = z.object({
  periodLabel: z.string().min(1),
  rating: z.enum(["NEEDS_IMPROVEMENT", "MEETS_EXPECTATIONS", "EXCEEDS_EXPECTATIONS", "OUTSTANDING"]),
  strengths: z.string().optional(),
  areasForImprovement: z.string().optional(),
  goals: z.string().optional(),
});

/** Owner/Admin manage reviews everywhere; Manager for their own branch's staff — the same tier that already manages the rest of a staff profile. Append-only history, so it applies immediately rather than going through edit-request approval. */
export async function addPerformanceReview(staffId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaffScoped(session.roles)) throw new Error("Forbidden");

  const staff = await db.staff.findUniqueOrThrow({ where: { id: staffId } });
  if (!isCompanyWide(session.roles) && staff.branchId !== session.branchId) throw new Error("Forbidden");

  const parsed = reviewSchema.parse({
    periodLabel: formData.get("periodLabel"),
    rating: formData.get("rating"),
    strengths: emptyToUndefined(formData.get("strengths")),
    areasForImprovement: emptyToUndefined(formData.get("areasForImprovement")),
    goals: emptyToUndefined(formData.get("goals")),
  });

  await db.performanceReview.create({
    data: { staffId, reviewerId: session.staffId, ...parsed },
  });
  revalidatePath(`/staff/${staffId}`);
}

const disciplinarySchema = z.object({
  severity: z.enum(["VERBAL_WARNING", "WRITTEN_WARNING", "FINAL_WARNING", "SUSPENSION"]),
  description: z.string().min(1),
  actionTaken: z.string().optional(),
  occurredAt: z.coerce.date(),
});

/** Same tier as addPerformanceReview — Owner/Admin everywhere, Manager for their own branch. */
export async function addDisciplinaryRecord(staffId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaffScoped(session.roles)) throw new Error("Forbidden");

  const staff = await db.staff.findUniqueOrThrow({ where: { id: staffId } });
  if (!isCompanyWide(session.roles) && staff.branchId !== session.branchId) throw new Error("Forbidden");

  const parsed = disciplinarySchema.parse({
    severity: formData.get("severity"),
    description: formData.get("description"),
    actionTaken: emptyToUndefined(formData.get("actionTaken")),
    occurredAt: formData.get("occurredAt"),
  });

  await db.disciplinaryRecord.create({
    data: { staffId, issuedById: session.staffId, ...parsed },
  });
  revalidatePath(`/staff/${staffId}`);
}

/** Which brand(s) this staff member works for — most are one, some work two. Surfaced to Accounting and Admins. */
export async function setStaffBrands(staffId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaffScoped(session.roles)) throw new Error("Forbidden");

  const staff = await db.staff.findUniqueOrThrow({ where: { id: staffId } });
  if (!isCompanyWide(session.roles) && staff.branchId !== session.branchId) throw new Error("Forbidden");

  const brandIds = formData.getAll("brandIds").map(String);

  await db.staff.update({
    where: { id: staffId },
    data: { brands: { set: brandIds.map((id) => ({ id })) } },
  });

  revalidatePath(`/staff/${staffId}`);
  revalidatePath("/staff");
}
