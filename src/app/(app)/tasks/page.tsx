import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canAssignTasks, isCompanyWide } from "@/lib/rbac";
import { TaskBoard } from "@/components/TaskBoard";
import { PrintButton } from "@/components/PrintButton";
import { formatDate } from "@/lib/utils";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  const { view } = await searchParams;
  const manager = canAssignTasks(session.role);
  const mineOnly = view === "mine" || !manager;

  const [tasks, staffForAssignment, branches, groupsForAssignment] = await Promise.all([
    db.task.findMany({
      where: mineOnly
        ? {
            OR: [
              { assignedToId: session.staffId },
              { group: { members: { some: { id: session.staffId } } } },
            ],
          }
        : branchScope(session),
      include: { assignedTo: true, assignedBy: true, group: { include: { members: true } } },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    }),
    manager
      ? db.staff.findMany({
          where: isCompanyWide(session.role) ? { active: true } : { branchId: session.branchId, active: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    manager && isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    manager
      ? db.staffGroup.findMany({
          where: isCompanyWide(session.role) ? {} : { branchId: session.branchId ?? "__none__" },
          include: { members: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const boardTasks = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    type: t.type,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    assignedTo: { id: t.assignedTo.id, name: t.assignedTo.name },
    assignedBy: { id: t.assignedBy.id, name: t.assignedBy.name },
    group: t.group
      ? { id: t.group.id, name: t.group.name, members: t.group.members.map((m) => ({ id: m.id, name: m.name })) }
      : null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Tasks</h1>
        <div className="flex items-center gap-3">
          <PrintButton selector="#tasks-print-table" label="Print" />
          {manager && (
            <div className="flex gap-2 text-sm print:hidden">
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
      </div>

      <div className="print-report-header">
        <h2 className="font-display text-xl font-semibold">{mineOnly ? "My tasks" : "Team tasks"}</h2>
        <p className="text-sm text-stone-500">Printed {formatDate(new Date())} — {boardTasks.length} task(s)</p>
      </div>

      <p className="text-sm text-stone-500 print:hidden">
        Drag a card between columns to update its status, or use the dropdown on the card — both work.
      </p>

      <div id="tasks-print-table" className="card hidden overflow-x-auto print:block">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-8 print:hidden">
                <span className="sr-only">Include in print</span>
              </th>
              <th>Title</th>
              <th>Type</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Assigned to</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {boardTasks.map((t) => (
              <tr key={t.id} data-print-row>
                <td className="print:hidden">
                  <input type="checkbox" data-print-checkbox defaultChecked className="h-4 w-4 rounded border-stone-300" aria-label={`Include task ${t.title} in print`} />
                </td>
                <td>{t.title}</td>
                <td>{t.type.replace("_", " ")}</td>
                <td>{t.priority}</td>
                <td>{t.status.replace("_", " ")}</td>
                <td>{t.group ? `${t.group.name} (group)` : t.assignedTo.name}</td>
                <td>{t.dueDate ? formatDate(new Date(t.dueDate)) : "—"}</td>
              </tr>
            ))}
            {boardTasks.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-stone-400">
                  No tasks to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="print:hidden">
      <TaskBoard
        tasks={boardTasks}
        canEditAny={manager}
        currentStaffId={session.staffId}
        staffOptions={staffForAssignment.map((s) => ({ id: s.id, name: s.name }))}
        groupOptions={groupsForAssignment.map((g) => ({
          id: g.id,
          name: g.name,
          memberNames: g.members.map((m) => m.name),
        }))}
        branchOptions={branches.map((b) => ({ id: b.id, name: b.name }))}
        showBranchSelect={isCompanyWide(session.role)}
        defaultBranchId={session.branchId ?? ""}
        canAssign={manager}
      />
      </div>
    </div>
  );
}
