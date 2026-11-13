"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canAssignTasks, isCompanyWide } from "@/lib/rbac";
import { notifyStaff } from "@/lib/notifications";

const createSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  type: z.enum(["DAILY", "SPECIAL"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  dueDate: z.coerce.date().optional(),
  assignedToId: z.string().min(1),
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
    assignedToId: formData.get("assignedToId"),
    branchId,
  });

  const task = await db.task.create({
    data: { ...parsed, assignedById: session.staffId },
  });

  await notifyStaff(
    parsed.assignedToId,
    "TASK_ASSIGNED",
    "New task assigned",
    `${session.name} assigned you: ${parsed.title}`,
    `/tasks/${task.id}`,
  );

  redirect("/tasks");
}

const statusSchema = z.enum(["PENDING", "IN_PROGRESS", "DONE"]);

export async function updateTaskStatus(taskId: string, formData: FormData) {
  const session = await requireSessionOrRedirect();
  const status = statusSchema.parse(formData.get("status"));

  const task = await db.task.findUniqueOrThrow({ where: { id: taskId } });
  const allowed = task.assignedToId === session.staffId || canAssignTasks(session.role);
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

  const task = await db.task.findUniqueOrThrow({ where: { id: taskId } });
  await db.taskComment.create({
    data: { taskId, staffId: session.staffId, body: parsed.body },
  });

  const notifyTarget = task.assignedToId === session.staffId ? task.assignedById : task.assignedToId;
  if (notifyTarget !== session.staffId) {
    await notifyStaff(
      notifyTarget,
      "TASK_COMMENT",
      "New comment on a task",
      `${session.name} commented on "${task.title}"`,
      `/tasks/${taskId}`,
    );
  }

  revalidatePath(`/tasks/${taskId}`);
}
