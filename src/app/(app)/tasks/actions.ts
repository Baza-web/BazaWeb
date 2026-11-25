"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect, type SessionPayload } from "@/lib/auth";
import { canAssignTasks, isCompanyWide } from "@/lib/rbac";
import { notifyStaff } from "@/lib/notifications";

const createSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  type: z.enum(["DAILY", "SPECIAL"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  dueDate: z.coerce.date().optional(),
  assignTarget: z.string().min(1),
  branchId: z.string().min(1),
  projectId: z.string().optional(),
});

export async function createTask(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const session = await requireSessionOrRedirect();
  if (!canAssignTasks(session.role)) throw new Error("Forbidden");

  const branchId = isCompanyWide(session.role)
    ? String(formData.get("branchId"))
    : session.branchId ?? String(formData.get("branchId"));

  const rawParsed = createSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    type: formData.get("type"),
    priority: formData.get("priority"),
    dueDate: formData.get("dueDate") || undefined,
    assignTarget: formData.get("assignTarget"),
    branchId,
    projectId: formData.get("projectId") || undefined,
  });
  if (!rawParsed.success) return { error: "Fill in the required fields (title, assignee)." };
  const parsed = rawParsed.data;

  const [kind, targetId] = parsed.assignTarget.split(":");

  let assignedToId: string;
  let groupId: string | null = null;
  let groupMemberIds: string[] = [];

  if (kind === "group") {
    const group = await db.staffGroup.findUniqueOrThrow({
      where: { id: targetId },
      include: { members: true },
    });
    if (group.branchId !== parsed.branchId) return { error: "That group doesn't belong to this branch." };
    if (group.members.length === 0) return { error: "This group has no members yet — add members before assigning it a task." };
    groupId = group.id;
    groupMemberIds = group.members.map((m) => m.id);
    assignedToId = groupMemberIds[0];
  } else {
    const assignee = await db.staff.findUnique({ where: { id: targetId } });
    if (!assignee || assignee.branchId !== parsed.branchId || !assignee.active) {
      return { error: "That staff member doesn't belong to this branch." };
    }
    assignedToId = targetId;
  }

  if (parsed.projectId) {
    const project = await db.project.findUnique({ where: { id: parsed.projectId } });
    if (!project) return { error: "That project no longer exists." };
  }

  const task = await db.task.create({
    data: {
      title: parsed.title,
      description: parsed.description,
      type: parsed.type,
      priority: parsed.priority,
      dueDate: parsed.dueDate,
      branchId: parsed.branchId,
      assignedToId,
      assignedById: session.staffId,
      groupId,
      projectId: parsed.projectId ?? null,
    },
  });

  const notifyIds = new Set(groupId ? groupMemberIds : [assignedToId]);
  notifyIds.delete(session.staffId);
  await Promise.all(
    Array.from(notifyIds).map((staffId) =>
      notifyStaff(
        staffId,
        "TASK_ASSIGNED",
        "New task assigned",
        `${session.name} assigned ${groupId ? "your group" : "you"}: ${parsed.title}`,
        `/tasks/${task.id}`,
      ),
    ),
  );

  revalidatePath("/tasks");
  if (parsed.projectId) revalidatePath(`/tasks/project/${parsed.projectId}`);
  return { ok: true };
}

const projectSchema = z.object({ name: z.string().min(2).max(80) });

/** Owner/Admin/Manager — same audience that can already assign tasks. Brand-linked projects are managed entirely through Brands (see applyBrandEdit); this is only for ad-hoc projects with no brand. */
export async function createSpecialProject(formData: FormData): Promise<{ error: string } | { id: string }> {
  const session = await requireSessionOrRedirect();
  if (!canAssignTasks(session.role)) throw new Error("Forbidden");

  const parsed = projectSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: "Enter a project name (at least 2 characters)." };

  const existing = await db.project.findFirst({ where: { name: { equals: parsed.data.name, mode: "insensitive" } } });
  if (existing) return { error: `A project named "${parsed.data.name}" already exists.` };

  const project = await db.project.create({ data: { name: parsed.data.name, createdById: session.staffId } });
  revalidatePath("/tasks");
  return { id: project.id };
}

async function canActOnTask(
  task: { assignedToId: string; groupId: string | null; branchId: string },
  session: SessionPayload,
) {
  if (task.assignedToId === session.staffId) return true;
  if (canAssignTasks(session.role) && (isCompanyWide(session.role) || task.branchId === session.branchId)) {
    return true;
  }
  if (!task.groupId) return false;
  const membership = await db.staffGroup.findFirst({
    where: { id: task.groupId, members: { some: { id: session.staffId } } },
  });
  return Boolean(membership);
}

const statusSchema = z.enum(["PENDING", "IN_PROGRESS", "DONE"]);

export async function updateTaskStatus(taskId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const status = statusSchema.parse(formData.get("status"));

  const task = await db.task.findUniqueOrThrow({ where: { id: taskId } });
  const allowed = await canActOnTask(task, session);
  if (!allowed) throw new Error("Forbidden");

  await db.task.update({
    where: { id: taskId },
    data: { status, completedAt: status === "DONE" ? new Date() : null },
  });

  if (status === "DONE" && task.assignedById !== session.staffId) {
    await notifyStaff(
      task.assignedById,
      "TASK_DUE",
      "Task completed",
      `${session.name} marked "${task.title}" as done.`,
      `/tasks/${task.id}`,
    );
  }

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
}

const commentSchema = z.object({ body: z.string().min(1) });

export async function addTaskComment(taskId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const parsed = commentSchema.parse({ body: formData.get("body") });

  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { group: { include: { members: true } } },
  });
  const allowed = await canActOnTask(task, session);
  if (!allowed) throw new Error("Forbidden");

  await db.taskComment.create({
    data: { taskId, staffId: session.staffId, body: parsed.body },
  });

  const notifyIds = new Set<string>([task.assignedById, task.assignedToId]);
  task.group?.members.forEach((m) => notifyIds.add(m.id));
  notifyIds.delete(session.staffId);

  await Promise.all(
    Array.from(notifyIds).map((staffId) =>
      notifyStaff(staffId, "TASK_COMMENT", "New comment on a task", `${session.name} commented on "${task.title}"`, `/tasks/${taskId}`),
    ),
  );

  revalidatePath(`/tasks/${taskId}`);
}
