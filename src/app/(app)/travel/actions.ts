"use server";

import crypto from "crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canAccessTravel, isCompanyWide } from "@/lib/rbac";
import { saveUploadedImages } from "@/lib/uploads";

function tourCode() {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `TOUR-${Date.now().toString(36).toUpperCase()}-${random}`;
}

function csvList(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function emptyToUndefined(value: FormDataEntryValue | null) {
  if (value === null) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

const numOrUndef = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.coerce.number().optional(),
);

const tourSchema = z.object({
  title: z.string().min(2),
  category: z.string().min(2),
  destination: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  durationMinutes: numOrUndef,
  description: z.string().optional(),
  highlights: z.string().optional(),
  includedItems: z.string().optional(),
  excludedItems: z.string().optional(),
  tourType: z.enum(["PRIVATE", "GROUP"]),
  minParticipants: numOrUndef,
  maxParticipants: numOrUndef,
  meetingPoint: z.string().optional(),
  pickupInfo: z.string().optional(),
  cancellationPolicy: z.string().optional(),
  importantInfo: z.string().optional(),
  priceAdult: numOrUndef,
  priceChild: numOrUndef,
  branchId: z.string().optional(),
  internalNotes: z.string().optional(),
});

function parseTourForm(formData: FormData) {
  return tourSchema.parse({
    title: formData.get("title"),
    category: formData.get("category"),
    destination: emptyToUndefined(formData.get("destination")),
    country: emptyToUndefined(formData.get("country")),
    city: emptyToUndefined(formData.get("city")),
    durationMinutes: formData.get("durationMinutes"),
    description: emptyToUndefined(formData.get("description")),
    highlights: emptyToUndefined(formData.get("highlights")),
    includedItems: emptyToUndefined(formData.get("includedItems")),
    excludedItems: emptyToUndefined(formData.get("excludedItems")),
    tourType: formData.get("tourType") || "GROUP",
    minParticipants: formData.get("minParticipants"),
    maxParticipants: formData.get("maxParticipants"),
    meetingPoint: emptyToUndefined(formData.get("meetingPoint")),
    pickupInfo: emptyToUndefined(formData.get("pickupInfo")),
    cancellationPolicy: emptyToUndefined(formData.get("cancellationPolicy")),
    importantInfo: emptyToUndefined(formData.get("importantInfo")),
    priceAdult: formData.get("priceAdult"),
    priceChild: formData.get("priceChild"),
    branchId: emptyToUndefined(formData.get("branchId")),
    internalNotes: emptyToUndefined(formData.get("internalNotes")),
  });
}

export async function createTour(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canAccessTravel(session.roles)) throw new Error("Forbidden");

  const parsed = parseTourForm(formData);

  const branchId = parsed.branchId ?? (isCompanyWide(session.roles) ? undefined : session.branchId ?? undefined);
  if (branchId) {
    const branch = await db.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new Error("That branch doesn't exist.");
  }

  const files = formData.getAll("images").filter((f) => f instanceof File) as File[];
  const images = await saveUploadedImages(files, "tours");

  const tour = await db.tour.create({
    data: {
      ...parsed,
      branchId: branchId ?? null,
      languages: csvList(formData.get("languages")),
      operatingDays: csvList(formData.get("operatingDays")),
      startingTimes: csvList(formData.get("startingTimes")),
      images,
      internalCode: tourCode(),
      createdById: session.staffId,
    },
  });

  revalidatePath("/travel/tours");
  revalidatePath("/travel");
  redirect(`/travel/tours/${tour.id}`);
}

async function requireTourAccess(tourId: string, session: { role: string; staffId: string; branchId: string | null }) {
  const tour = await db.tour.findUniqueOrThrow({ where: { id: tourId } });
  if (!canAccessTravel(session.role as never)) throw new Error("Forbidden");
  if (!isCompanyWide(session.role as never) && tour.branchId && tour.branchId !== session.branchId) {
    throw new Error("Forbidden");
  }
  return tour;
}

export async function updateTour(tourId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const tour = await requireTourAccess(tourId, session);
  if (tour.status === "ARCHIVED") throw new Error("This tour is archived — restore it before editing.");

  const parsed = parseTourForm(formData);

  const branchId = parsed.branchId ?? (isCompanyWide(session.roles) ? undefined : session.branchId ?? undefined);
  if (branchId) {
    const branch = await db.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new Error("That branch doesn't exist.");
  }

  const newFiles = formData.getAll("images").filter((f) => f instanceof File) as File[];
  const newImages = await saveUploadedImages(newFiles, "tours");

  await db.tour.update({
    where: { id: tourId },
    data: {
      ...parsed,
      branchId: branchId ?? null,
      languages: csvList(formData.get("languages")),
      operatingDays: csvList(formData.get("operatingDays")),
      startingTimes: csvList(formData.get("startingTimes")),
      images: newImages.length > 0 ? [...tour.images, ...newImages] : tour.images,
    },
  });

  revalidatePath(`/travel/tours/${tourId}`);
  revalidatePath("/travel/tours");
  revalidatePath("/travel");
}

export async function removeTourImage(tourId: string, imageUrl: string) {
  const session = await requireSessionOrRedirect();
  const tour = await requireTourAccess(tourId, session);

  await db.tour.update({
    where: { id: tourId },
    data: { images: tour.images.filter((img) => img !== imageUrl) },
  });

  revalidatePath(`/travel/tours/${tourId}`);
}

export async function submitTourForApproval(tourId: string) {
  const session = await requireSessionOrRedirect();
  const tour = await requireTourAccess(tourId, session);
  if (tour.status !== "DRAFT") throw new Error("Only a draft tour can be submitted for approval.");

  await db.tour.update({ where: { id: tourId }, data: { status: "PENDING_APPROVAL" } });
  revalidatePath(`/travel/tours/${tourId}`);
  revalidatePath("/travel/tours");
  revalidatePath("/travel");
}

export async function approveTour(tourId: string) {
  const session = await requireSessionOrRedirect();
  const tour = await requireTourAccess(tourId, session);
  if (tour.status !== "PENDING_APPROVAL") throw new Error("Only a tour pending approval can be approved.");

  await db.tour.update({
    where: { id: tourId },
    data: { status: "APPROVED", approvedById: session.staffId, approvedAt: new Date() },
  });
  revalidatePath(`/travel/tours/${tourId}`);
  revalidatePath("/travel/tours");
  revalidatePath("/travel");
}

export async function sendTourBackToDraft(tourId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const tour = await requireTourAccess(tourId, session);
  if (tour.status !== "PENDING_APPROVAL") throw new Error("Only a tour pending approval can be sent back.");

  const reason = emptyToUndefined(formData.get("reason"));
  await db.tour.update({
    where: { id: tourId },
    data: {
      status: "DRAFT",
      internalNotes: reason ? `${tour.internalNotes ? tour.internalNotes + "\n" : ""}Sent back: ${reason}` : tour.internalNotes,
    },
  });
  revalidatePath(`/travel/tours/${tourId}`);
  revalidatePath("/travel/tours");
  revalidatePath("/travel");
}

export async function archiveTour(tourId: string) {
  const session = await requireSessionOrRedirect();
  await requireTourAccess(tourId, session);

  await db.tour.update({ where: { id: tourId }, data: { status: "ARCHIVED", archivedAt: new Date() } });
  revalidatePath(`/travel/tours/${tourId}`);
  revalidatePath("/travel/tours");
  revalidatePath("/travel");
}

export async function restoreTour(tourId: string) {
  const session = await requireSessionOrRedirect();
  await requireTourAccess(tourId, session);

  await db.tour.update({ where: { id: tourId }, data: { status: "DRAFT", archivedAt: null } });
  revalidatePath(`/travel/tours/${tourId}`);
  revalidatePath("/travel/tours");
  revalidatePath("/travel");
}
