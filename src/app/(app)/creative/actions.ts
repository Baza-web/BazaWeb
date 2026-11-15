"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect, type SessionPayload } from "@/lib/auth";
import { canAccessCreativeHub, STAFF_MANAGER_ROLES } from "@/lib/rbac";
import { notifyStaff } from "@/lib/notifications";
import { saveUploadedImages } from "@/lib/uploads";

type GroupWithMembers = { id: string; name: string; members: { id: string }[] };

/** A creative team's own members can act inside it; Owner/Admin can act on any team, even ones they don't belong to. */
function canActOnGroup(group: GroupWithMembers, session: SessionPayload) {
  return group.members.some((m) => m.id === session.staffId) || STAFF_MANAGER_ROLES.includes(session.role);
}

async function requireGroupAccess(groupId: string, session: SessionPayload) {
  const group = await db.staffGroup.findUniqueOrThrow({ where: { id: groupId }, include: { members: true } });
  if (!canActOnGroup(group, session)) throw new Error("Forbidden");
  return group;
}

const messageSchema = z.object({ body: z.string().min(1) });

export async function sendGroupMessage(groupId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canAccessCreativeHub(session.role)) throw new Error("Forbidden");

  const group = await requireGroupAccess(groupId, session);
  const { body } = messageSchema.parse({ body: formData.get("body") });

  await db.groupMessage.create({
    data: { groupId, senderId: session.staffId, body },
  });

  const notifyIds = group.members.map((m) => m.id).filter((id) => id !== session.staffId);
  await Promise.all(
    notifyIds.map((staffId) =>
      notifyStaff(staffId, "NEW_MESSAGE", `${session.name} in ${group.name}`, body.slice(0, 140), "/creative"),
    ),
  );

  revalidatePath("/creative");
}

const platformSchema = z.enum(["INSTAGRAM", "FACEBOOK", "TIKTOK", "WHATSAPP_STATUS", "OTHER"]);
const statusSchema = z.enum(["IDEA", "DRAFTING", "READY", "SCHEDULED", "POSTED"]);

const postSchema = z.object({
  title: z.string().min(2),
  platform: platformSchema,
  caption: z.string().optional(),
  notes: z.string().optional(),
  scheduledAt: z.coerce.date().optional(),
  assignedToId: z.string().optional(),
});

function emptyToUndefined(value: FormDataEntryValue | null) {
  if (value === null) return undefined;
  const s = String(value);
  return s === "" ? undefined : s;
}

async function assertAssigneeInGroup(assignedToId: string | undefined, group: GroupWithMembers) {
  if (!assignedToId) return;
  if (!group.members.some((m) => m.id === assignedToId)) {
    throw new Error("That person isn't on this team.");
  }
}

export async function createSocialPost(groupId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canAccessCreativeHub(session.role)) throw new Error("Forbidden");

  const group = await requireGroupAccess(groupId, session);
  const parsed = postSchema.parse({
    title: formData.get("title"),
    platform: formData.get("platform"),
    caption: emptyToUndefined(formData.get("caption")),
    notes: emptyToUndefined(formData.get("notes")),
    scheduledAt: emptyToUndefined(formData.get("scheduledAt")),
    assignedToId: emptyToUndefined(formData.get("assignedToId")),
  });
  await assertAssigneeInGroup(parsed.assignedToId, group);

  const files = formData.getAll("images").filter((f) => f instanceof File) as File[];
  const images = await saveUploadedImages(files, "social-posts");

  await db.socialPost.create({
    data: {
      groupId,
      title: parsed.title,
      platform: parsed.platform,
      caption: parsed.caption,
      notes: parsed.notes,
      scheduledAt: parsed.scheduledAt,
      status: parsed.scheduledAt ? "SCHEDULED" : "IDEA",
      assignedToId: parsed.assignedToId,
      images,
      createdById: session.staffId,
    },
  });

  if (parsed.assignedToId && parsed.assignedToId !== session.staffId) {
    await notifyStaff(
      parsed.assignedToId,
      "TASK_ASSIGNED",
      "New content post assigned",
      `${session.name} assigned you: ${parsed.title}`,
      "/creative",
    );
  }

  revalidatePath("/creative");
}

async function requirePostAccess(postId: string, session: SessionPayload) {
  const post = await db.socialPost.findUniqueOrThrow({ where: { id: postId }, include: { group: { include: { members: true } } } });
  if (!canActOnGroup(post.group, session)) throw new Error("Forbidden");
  return post;
}

export async function updateSocialPost(postId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canAccessCreativeHub(session.role)) throw new Error("Forbidden");

  const post = await requirePostAccess(postId, session);
  const parsed = postSchema.parse({
    title: formData.get("title"),
    platform: formData.get("platform"),
    caption: emptyToUndefined(formData.get("caption")),
    notes: emptyToUndefined(formData.get("notes")),
    scheduledAt: emptyToUndefined(formData.get("scheduledAt")),
    assignedToId: emptyToUndefined(formData.get("assignedToId")),
  });
  await assertAssigneeInGroup(parsed.assignedToId, post.group);

  const files = formData.getAll("images").filter((f) => f instanceof File) as File[];
  const newImages = await saveUploadedImages(files, "social-posts");

  await db.socialPost.update({
    where: { id: postId },
    data: {
      title: parsed.title,
      platform: parsed.platform,
      caption: parsed.caption,
      notes: parsed.notes,
      scheduledAt: parsed.scheduledAt,
      assignedToId: parsed.assignedToId,
      images: newImages.length > 0 ? [...post.images, ...newImages] : undefined,
    },
  });

  revalidatePath("/creative");
  revalidatePath(`/creative/posts/${postId}`);
}

export async function updateSocialPostStatus(postId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canAccessCreativeHub(session.role)) throw new Error("Forbidden");

  await requirePostAccess(postId, session);
  const status = statusSchema.parse(formData.get("status"));

  await db.socialPost.update({
    where: { id: postId },
    data: { status, postedAt: status === "POSTED" ? new Date() : null },
  });

  revalidatePath("/creative");
  revalidatePath(`/creative/posts/${postId}`);
}

export async function deleteSocialPost(postId: string) {
  const session = await requireSessionOrRedirect();
  if (!canAccessCreativeHub(session.role)) throw new Error("Forbidden");

  await requirePostAccess(postId, session);
  await db.socialPost.delete({ where: { id: postId } });
  revalidatePath("/creative");
  redirect("/creative");
}
