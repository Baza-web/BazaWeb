import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canAssignTasks, isCompanyWide } from "@/lib/rbac";
import { TaskBoard } from "@/components/TaskBoard";

export default async function ProjectTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const manager = canAssignTasks(session.roles);
  if (!manager) notFound();

  const { id } = await params;
  const scope = branchScope(session);
  const isUnsorted = id === "unsorted";

  let projectName = "Unsorted";
  if (!isUnsorted) {
    const project = await db.project.findUnique({ where: { id } });
    if (!project) notFound();
    projectName = project.name;
  }

  const [tasks, staffForAssignment, branches, groupsForAssignment] = await Promise.all([
    db.task.findMany({
      where: { ...scope, projectId: isUnsorted ? null : id },
      include: { assignedTo: true, assignedBy: true, group: { include: { members: true } }, project: true },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    }),
    db.staff.findMany({
      where: isCompanyWide(session.roles) ? { active: true } : { branchId: session.branchId, active: true },
      orderBy: { name: "asc" },
    }),
    isCompanyWide(session.roles) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    db.staffGroup.findMany({
      where: isCompanyWide(session.roles) ? {} : { branchId: session.branchId ?? "__none__" },
      include: { members: true },
      orderBy: { name: "asc" },
    }),
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
      <div>
        <Link href="/tasks" className="text-sm font-medium text-brand-600 hover:underline">
          ← Projects
        </Link>
        <h1 className="page-title mt-1">{projectName}</h1>
      </div>

      <p className="text-sm text-stone-500">
        Drag a card between columns to update its status, or use the dropdown on the card — both work.
      </p>

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
        showBranchSelect={isCompanyWide(session.roles)}
        defaultBranchId={session.branchId ?? ""}
        canAssign={manager && !isUnsorted}
        projectId={isUnsorted ? undefined : id}
      />
    </div>
  );
}
