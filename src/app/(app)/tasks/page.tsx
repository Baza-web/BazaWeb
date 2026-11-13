import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canAssignTasks, isCompanyWide } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";
import { createTask } from "./actions";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-stone-200 text-stone-600",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  DONE: "bg-green-100 text-green-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-stone-100 text-stone-500",
  NORMAL: "bg-blue-50 text-blue-600",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  const { view } = await searchParams;
  const manager = canAssignTasks(session.role);
  const mineOnly = view === "mine" || !manager;

  const [tasks, staffForAssignment, branches] = await Promise.all([
    db.task.findMany({
      where: mineOnly ? { assignedToId: session.staffId } : branchScope(session),
      include: { assignedTo: true, assignedBy: true },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    }),
    manager
      ? db.staff.findMany({
          where: isCompanyWide(session.role) ? { active: true } : { branchId: session.branchId, active: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    manager && isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tasks</h1>
        {manager && (
          <div className="flex gap-2 text-sm">
            <Link href="/tasks" className={!mineOnly ? "font-medium text-brand-700" : "text-stone-500"}>
              Team tasks
            </Link>
            <span className="text-stone-300">|</span>
            <Link href="/tasks?view=mine" className={mineOnly ? "font-medium text-brand-700" : "text-stone-500"}>
              My tasks
            </Link>
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Priority</th>
              <th>Assigned to</th>
              <th>Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link href={`/tasks/${t.id}`} className="text-brand-700 hover:underline">
                    {t.title}
                  </Link>
                </td>
                <td>{t.type}</td>
                <td>
                  <span className={`badge ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</span>
                </td>
                <td>{t.assignedTo.name}</td>
                <td>{t.dueDate ? formatDate(t.dueDate) : "—"}</td>
                <td>
                  <span className={`badge ${STATUS_COLORS[t.status]}`}>{t.status.replace("_", " ")}</span>
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-stone-400">
                  No tasks.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {manager && (
        <div className="card max-w-lg">
          <h2 className="mb-3 font-medium">Assign a task</h2>
          <form action={createTask} className="space-y-3">
            {isCompanyWide(session.role) ? (
              <div>
                <label className="label">Branch</label>
                <select className="input" name="branchId" required>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <input type="hidden" name="branchId" value={session.branchId ?? ""} />
            )}
            <div>
              <label className="label">Title</label>
              <input className="input" name="title" required />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input" name="description" rows={2} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Type</label>
                <select className="input" name="type" defaultValue="DAILY">
                  <option value="DAILY">Daily</option>
                  <option value="SPECIAL">Special</option>
                </select>
              </div>
              <div>
                <label className="label">Priority</label>
                <select className="input" name="priority" defaultValue="NORMAL">
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
              <div>
                <label className="label">Due date</label>
                <input className="input" name="dueDate" type="date" />
              </div>
              <div>
                <label className="label">Assign to</label>
                <select className="input" name="assignedToId" required>
                  {staffForAssignment.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" className="btn-primary">
              Assign task
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
