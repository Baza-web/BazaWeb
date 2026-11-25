import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canAssignTasks, isCompanyWide } from "@/lib/rbac";
import { TaskBoard } from "@/components/TaskBoard";
import { CreateSpecialProjectForm } from "@/components/CreateSpecialProjectForm";
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

  if (!mineOnly) {
    return <ProjectsList session={session} />;
  }

  const [tasks, staffForAssignment, branches, groupsForAssignment] = await Promise.all([
    db.task.findMany({
      where: {
        OR: [
          { assignedToId: session.staffId },
          { group: { members: { some: { id: session.staffId } } } },
        ],
      },
      include: { assignedTo: true, assignedBy: true, group: { include: { members: true } }, project: true },
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
    project: t.project ? { id: t.project.id, name: t.project.name } : null,
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
        <h2 className="font-display text-xl font-semibold">My tasks</h2>
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
              <th>Project</th>
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
                <td>{t.project?.name ?? "—"}</td>
                <td>{t.type.replace("_", " ")}</td>
                <td>{t.priority}</td>
                <td>{t.status.replace("_", " ")}</td>
                <td>{t.group ? `${t.group.name} (group)` : t.assignedTo.name}</td>
                <td>{t.dueDate ? formatDate(new Date(t.dueDate)) : "—"}</td>
              </tr>
            ))}
            {boardTasks.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-stone-400">
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

async function ProjectsList({ session }: { session: Awaited<ReturnType<typeof requireSessionOrRedirect>> }) {
  const scope = branchScope(session);

  const [projects, unsortedCount] = await Promise.all([
    db.project.findMany({
      include: {
        brand: true,
        tasks: { where: scope, select: { status: true } },
      },
      orderBy: [{ brandId: "asc" }, { name: "asc" }],
    }),
    db.task.count({ where: { ...scope, projectId: null } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Tasks</h1>
        <div className="flex gap-2 text-sm print:hidden">
          <span className="font-medium text-brand-700">Team tasks</span>
          <span className="text-stone-300">|</span>
          <Link href="/tasks?view=mine" className="text-stone-500">
            My tasks
          </Link>
        </div>
      </div>
      <p className="text-sm text-stone-500">
        Every brand is automatically a project. Create a special project for one-off work that
        isn&apos;t tied to a brand — a showroom opening, an event, anything with its own set of
        tasks assigned across different staff.
      </p>

      <div className="card max-w-md">
        <h2 className="mb-3 font-medium">New special project</h2>
        <CreateSpecialProjectForm />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const pending = p.tasks.filter((t) => t.status === "PENDING").length;
          const inProgress = p.tasks.filter((t) => t.status === "IN_PROGRESS").length;
          const done = p.tasks.filter((t) => t.status === "DONE").length;
          return (
            <Link
              key={p.id}
              href={`/tasks/project/${p.id}`}
              className="card space-y-3 transition hover:shadow-card-hover"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-ink-900">{p.name}</h3>
                {p.brand ? (
                  <span className="badge bg-blue-50 text-blue-700">Brand</span>
                ) : (
                  <span className="badge bg-purple-50 text-purple-700">Special</span>
                )}
              </div>
              <div className="flex gap-3 text-xs text-stone-500">
                <span>{pending} pending</span>
                <span>{inProgress} in progress</span>
                <span>{done} done</span>
              </div>
            </Link>
          );
        })}

        {unsortedCount > 0 && (
          <Link
            href="/tasks/project/unsorted"
            className="card space-y-3 border-dashed transition hover:shadow-card-hover"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-ink-900">Unsorted</h3>
              <span className="badge bg-stone-100 text-stone-600">{unsortedCount} task(s)</span>
            </div>
            <p className="text-xs text-stone-400">Tasks created before projects existed.</p>
          </Link>
        )}

        {projects.length === 0 && unsortedCount === 0 && (
          <p className="text-sm text-stone-400">No projects yet — add a brand or create a special project above.</p>
        )}
      </div>
    </div>
  );
}
