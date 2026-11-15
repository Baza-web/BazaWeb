"use client";

import { useEffect } from "react";
import { createSocialPost } from "@/app/(app)/creative/actions";
import { X } from "./icons";

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  WHATSAPP_STATUS: "WhatsApp Status",
  OTHER: "Other",
};

export function SocialPostModal({
  open,
  onClose,
  groupId,
  memberOptions,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  memberOptions: { id: string; name: string }[];
  defaultDate?: string;
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
      <button aria-label="Close dialog" onClick={onClose} className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-post-title"
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-card-hover"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="new-post-title" className="section-title">
            Plan a post
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

        <form action={createSocialPost.bind(null, groupId)} className="space-y-4" onSubmit={() => onClose()}>
          <div>
            <label className="label">Title</label>
            <input className="input" name="title" required autoFocus placeholder="Diwali collection teaser" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Platform</label>
              <select className="input" name="platform" defaultValue="INSTAGRAM">
                {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Assign to</label>
              <select className="input" name="assignedToId" defaultValue="">
                <option value="">Unassigned</option>
                {memberOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Scheduled date & time</label>
            <input className="input" name="scheduledAt" type="datetime-local" defaultValue={defaultDate} />
            <p className="mt-1 text-xs text-stone-400">Leave blank to keep it as an unscheduled idea.</p>
          </div>
          <div>
            <label className="label">Caption</label>
            <textarea className="input" name="caption" rows={3} placeholder="The post copy…" />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" name="notes" rows={2} placeholder="Production notes for the team…" />
          </div>
          <div>
            <label className="label">Reference images</label>
            <input className="input" name="images" type="file" accept="image/*" multiple />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
