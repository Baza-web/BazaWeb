import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canAssignTasks } from "@/lib/rbac";
import { formatDate, formatDateTime } from "@/lib/utils";
import { updateTaskStatus, addTaskComment } from "../actions";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;

  const task = await db.task.findUnique({
    where: { id },
    include: {
      assignedTo: true,
      assignedBy: true,
      comments: { include: { staff: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!task) notFound();

  const canEdit = task.assignedToId === session.staffId || canAssignTasks(session.role);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-stone-500">
          {task.type} · {task.priority}
        </p>
        <h1 className="page-title">{task.title}</h1>
        <p className="text-sm text-stone-500">
          Assigned to {task.assignedTo.name} by {task.assignedBy.name}
          {task.dueDate ? ` · Due ${formatDate(task.dueDate)}` : ""}
        </p>
      </div>

      {task.description && <div className="card">{task.description}</div>}

      {canEdit && (
        <div className="card">
          <p className="mb-2 text-sm font-medium">Status: {task.status.replace("_", " ")}</p>
          <form action={updateTaskStatus.bind(null, task.id)} className="flex gap-2">
            <select className="input max-w-[180px]" name="status" defaultValue={task.status}>
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="DONE">Done</option>
            </select>
            <button type="submit" className="btn-secondary">
              Update
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 font-medium">Comments</h2>
        <form action={addTaskComment.bind(null, task.id)} className="mb-4 flex gap-2">
          <input className="input" name="body" placeholder="Add a comment…" required />
          <button type="submit" className="btn-secondary">
            Post
          </button>
        </form>
        <ul className="space-y-3 text-sm">
          {task.comments.map((c) => (
            <li key={c.id} className="border-t border-stone-100 pt-2">
              <p>{c.body}</p>
              <p className="text-xs text-stone-400">
                {c.staff.name} · {formatDateTime(c.createdAt)}
              </p>
            </li>
          ))}
          {task.comments.length === 0 && <p className="text-stone-400">No comments yet.</p>}
        </ul>
      </div>
    </div>
  );
}
