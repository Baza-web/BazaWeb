"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { updateTaskStatus } from "@/app/(app)/tasks/actions";
import { initials, formatDate } from "@/lib/utils";
import { Plus, CaretDown, Clock, WarningCircle, UsersFour } from "./icons";
import { TaskAssignModal } from "./TaskAssignModal";

type TaskStatus = "PENDING" | "IN_PROGRESS" | "DONE";

export type BoardTask = {
  id: string;
  title: string;
  type: "DAILY" | "SPECIAL";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  status: TaskStatus;
  dueDate: string | null;
  assignedTo: { id: string; name: string };
  assignedBy: { id: string; name: string };
  group: { id: string; name: string; members: { id: string; name: string }[] } | null;
};

const COLUMNS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: "PENDING", label: "Pending", accent: "bg-stone-400" },
  { status: "IN_PROGRESS", label: "In Progress", accent: "bg-amber-500" },
  { status: "DONE", label: "Done", accent: "bg-green-600" },
];

const PRIORITY_STYLES: Record<string, string> = {
  LOW: "bg-stone-100 text-stone-500",
  NORMAL: "bg-blue-50 text-blue-600",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

function isOverdue(dueDate: string | null, status: TaskStatus) {
  if (!dueDate || status === "DONE") return false;
  return new Date(dueDate).getTime() < Date.now();
}

export function TaskBoard({
  tasks,
  canEditAny,
  currentStaffId,
  staffOptions,
  groupOptions,
  branchOptions,
  showBranchSelect,
  defaultBranchId,
  canAssign,
}: {
  tasks: BoardTask[];
  canEditAny: boolean;
  currentStaffId: string;
  staffOptions: { id: string; name: string }[];
  groupOptions: { id: string; name: string; memberNames: string[] }[];
  branchOptions: { id: string; name: string }[];
  showBranchSelect: boolean;
  defaultBranchId: string;
  canAssign: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(tasks);
  const [dragId, setDragId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [, startTransition] = useTransition();

  function canEdit(task: BoardTask) {
    return (
      canEditAny ||
      task.assignedTo.id === currentStaffId ||
      Boolean(task.group?.members.some((m) => m.id === currentStaffId))
    );
  }

  function moveTask(taskId: string, status: TaskStatus) {
    const task = items.find((t) => t.id === taskId);
    if (!task || !canEdit(task) || task.status === status) return;

    setItems((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));

    const fd = new FormData();
    fd.set("status", status);
    startTransition(async () => {
      await updateTaskStatus(taskId, fd);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {canAssign && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setModalOpen(true)} className="btn-primary">
            <Plus size={16} aria-hidden="true" />
            Assign task
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const colTasks = items.filter((t) => t.status === col.status);
          return (
            <div
              key={col.status}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId) moveTask(dragId, col.status);
                setDragId(null);
              }}
              className="flex min-h-[200px] flex-col gap-3 rounded-2xl bg-stone-100/70 p-3"
            >
              <div className="flex items-center gap-2 px-1">
                <span className={`h-2 w-2 rounded-full ${col.accent}`} aria-hidden="true" />
                <h3 className="text-sm font-semibold text-ink-800">{col.label}</h3>
                <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs text-stone-500">
                  {colTasks.length}
                </span>
              </div>

              {colTasks.map((task) => {
                const editable = canEdit(task);
                const overdue = isOverdue(task.dueDate, task.status);
                return (
                  <div
                    key={task.id}
                    draggable={editable}
                    onDragStart={() => setDragId(task.id)}
                    className={`card space-y-2 p-3 ${editable ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/tasks/${task.id}`}
                        className="text-sm font-medium text-ink-900 hover:text-brand-700"
                      >
                        {task.title}
                      </Link>
                      <span className={`badge shrink-0 ${PRIORITY_STYLES[task.priority]}`}>
                        {task.priority}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span className="badge bg-stone-100 text-stone-500">{task.type}</span>
                      {task.dueDate && (
                        <span className={`flex items-center gap-1 ${overdue ? "text-red-600" : ""}`}>
                          {overdue ? (
                            <WarningCircle size={13} weight="fill" aria-hidden="true" />
                          ) : (
                            <Clock size={13} aria-hidden="true" />
                          )}
                          {formatDate(task.dueDate)}
                        </span>
                      )}
                    </div>

                    {task.group && (
                      <div className="flex items-center gap-1 text-xs text-brand-700">
                        <UsersFour size={13} aria-hidden="true" />
                        {task.group.name}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="avatar h-6 w-6 text-[10px]">{initials(task.assignedTo.name)}</span>
                        <span className="text-xs text-stone-600">
                          {task.group ? `${task.assignedTo.name} (lead)` : task.assignedTo.name}
                        </span>
                      </div>

                      {editable && (
                        <div className="relative">
                          <select
                            aria-label={`Change status for ${task.title}`}
                            value={task.status}
                            onChange={(e) => moveTask(task.id, e.target.value as TaskStatus)}
                            className="cursor-pointer appearance-none rounded-md border border-stone-200 bg-white py-1 pl-2 pr-6 text-xs text-stone-600 hover:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                          >
                            <option value="PENDING">Pending</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="DONE">Done</option>
                          </select>
                          <CaretDown
                            size={10}
                            className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-stone-400"
                            aria-hidden="true"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {colTasks.length === 0 && (
                <p className="px-1 py-6 text-center text-xs text-stone-400">No tasks here.</p>
              )}
            </div>
          );
        })}
      </div>

      {canAssign && (
        <TaskAssignModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          staffOptions={staffOptions}
          groupOptions={groupOptions}
          branchOptions={branchOptions}
          showBranchSelect={showBranchSelect}
          defaultBranchId={defaultBranchId}
        />
      )}
    </div>
  );
}
