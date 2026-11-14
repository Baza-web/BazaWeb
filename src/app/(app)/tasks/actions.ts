"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
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
});

export async function createTask(formData: FormData) {
  const session = await requireSessionOrRedirect();
  if (!canAssignTasks(session.role)) throw new Error("Forbidden");

  const branchId = isCompanyWide(session.role)
    ? String(formData.get("branchId"))
    : session.branchId ?? String(formData.get("branchId"));

  const parsed = createSchema.parse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    type: formData.get("type"),
    priority: formData.get("priority"),
    dueDate: formData.get("dueDate") || undefined,
    assignTarget: formData.get("assignTarget"),
    branchId,
  });

  const [kind, targetId] = parsed.assignTarget.split(":");

  let assignedToId: string;
  let groupId: string | null = null;
  let groupMemberIds: string[] = [];

  if (kind === "group") {
    const group = await db.staffGroup.findUniqueOrThrow({
      where: { id: targetId },
      include: { members: true },
    });
    if (group.members.length === 0) throw new Error("This group has no members yet.");
    groupId = group.id;
    groupMemberIds = group.members.map((m) => m.id);
    assignedToId = groupMemberIds[0];
  } else {
    assignedToId = targetId;
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

  redirect("/tasks");
}

async function canActOnTask(task: { assignedToId: string; groupId: string | null }, session: SessionPayload) {
  if (task.assignedToId === session.staffId) return true;
  if (canAssignTasks(session.role)) return true;
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
