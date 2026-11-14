"use client";

import { useEffect } from "react";
import { createTask } from "@/app/(app)/tasks/actions";
import { X } from "./icons";

export function TaskAssignModal({
  open,
  onClose,
  staffOptions,
  groupOptions,
  branchOptions,
  showBranchSelect,
  defaultBranchId,
}: {
  open: boolean;
  onClose: () => void;
  staffOptions: { id: string; name: string }[];
  groupOptions: { id: string; name: string; memberNames: string[] }[];
  branchOptions: { id: string; name: string }[];
  showBranchSelect: boolean;
  defaultBranchId: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close dialog"
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-task-title"
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-card-hover"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="assign-task-title" className="section-title">
            Assign a task
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-ink-900"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form action={createTask} className="space-y-4">
          {showBranchSelect ? (
            <div>
              <label className="label">Branch</label>
              <select className="input" name="branchId" required>
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <input type="hidden" name="branchId" value={defaultBranchId} />
          )}
          <div>
            <label className="label">Title</label>
            <input className="input" name="title" required autoFocus />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" name="description" rows={2} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <select className="input" name="assignTarget" required defaultValue="">
                <option value="" disabled>
                  Select staff or a group…
                </option>
                <optgroup label="Staff">
                  {staffOptions.map((s) => (
                    <option key={s.id} value={`staff:${s.id}`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
                {groupOptions.length > 0 && (
                  <optgroup label="Groups">
                    {groupOptions.map((g) => (
                      <option key={g.id} value={`group:${g.id}`}>
                        {g.name} ({g.memberNames.join(", ") || "no members"})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Assign task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
