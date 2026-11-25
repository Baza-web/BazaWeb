"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateStaffRole, updateStaffAdditionalRoles } from "@/app/(app)/staff/actions";
import { CaretDown, Check } from "./icons";

const MAX_TOTAL_ROLES = 3;

export function RolesPicker({
  staffId,
  currentRole,
  currentAdditionalRoles,
  roleOptions,
  disabled,
}: {
  staffId: string;
  currentRole: string;
  currentAdditionalRoles: string[];
  roleOptions: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [primary, setPrimary] = useState(currentRole);
  const [extras, setExtras] = useState<string[]>(currentAdditionalRoles.filter((r) => r !== currentRole));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const labelFor = (value: string) => roleOptions.find((r) => r.value === value)?.label ?? value;
  const selected = [primary, ...extras];
  const atCap = selected.length >= MAX_TOTAL_ROLES;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePanel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function closePanel() {
    setOpen(false);
    setError(null);
    setPrimary(currentRole);
    setExtras(currentAdditionalRoles.filter((r) => r !== currentRole));
  }

  function toggleRole(role: string, checked: boolean) {
    if (checked) {
      if (atCap) return;
      setExtras((prev) => [...prev, role]);
      return;
    }
    if (role === primary) {
      if (extras.length === 0) return; // always keep at least one role selected
      const [nextPrimary, ...rest] = extras;
      setPrimary(nextPrimary);
      setExtras(rest);
    } else {
      setExtras((prev) => prev.filter((r) => r !== role));
    }
  }

  function makePrimary(role: string) {
    if (role === primary) return;
    setExtras((prev) => [...prev.filter((r) => r !== role), primary]);
    setPrimary(role);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      if (primary !== currentRole) {
        const fd = new FormData();
        fd.set("role", primary);
        const result = await updateStaffRole(staffId, fd);
        if ("error" in result) {
          setError(result.error);
          return;
        }
      }
      const sortedExtras = [...extras].sort();
      const sortedCurrentExtras = [...currentAdditionalRoles.filter((r) => r !== primary)].sort();
      if (JSON.stringify(sortedExtras) !== JSON.stringify(sortedCurrentExtras)) {
        const fd = new FormData();
        extras.forEach((r) => fd.append("additionalRoles", r));
        const result = await updateStaffAdditionalRoles(staffId, fd);
        if ("error" in result) {
          setError(result.error);
          return;
        }
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="input flex min-h-[44px] w-full items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-ink-900">{labelFor(primary)}</span>
          {extras.map((r) => (
            <span key={r} className="badge bg-brand-50 text-brand-700">
              {labelFor(r)}
            </span>
          ))}
        </span>
        <CaretDown size={14} className="shrink-0 text-stone-400" aria-hidden="true" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close roles menu"
            onClick={closePanel}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="listbox"
            aria-multiselectable="true"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-xl border border-stone-200 bg-white p-2 shadow-card-hover"
          >
            <p className="px-2 pb-2 pt-1 text-xs text-stone-400">
              Up to {MAX_TOTAL_ROLES} roles total. Permissions are the union of all selected; the primary one
              drives their dashboard and badges.
            </p>
            <ul className="space-y-0.5">
              {roleOptions.map((r) => {
                const isChecked = selected.includes(r.value);
                const isPrimary = r.value === primary;
                const disableCheckbox = !isChecked && atCap;
                return (
                  <li key={r.value}>
                    <div
                      className={`flex items-center gap-2 rounded-lg px-2 py-2.5 ${
                        disableCheckbox ? "opacity-40" : "hover:bg-stone-50"
                      }`}
                    >
                      <label className="flex min-h-[24px] min-w-[24px] flex-1 cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0 rounded border-stone-300"
                          checked={isChecked}
                          disabled={disableCheckbox}
                          onChange={(e) => toggleRole(r.value, e.target.checked)}
                        />
                        <span className="text-sm text-ink-900">{r.label}</span>
                      </label>
                      {isChecked &&
                        (isPrimary ? (
                          <span className="badge flex shrink-0 items-center gap-1 bg-brand-100 text-brand-700">
                            <Check size={11} weight="bold" aria-hidden="true" />
                            Primary
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => makePrimary(r.value)}
                            className="shrink-0 whitespace-nowrap text-xs font-medium text-brand-700 hover:underline"
                          >
                            Set primary
                          </button>
                        ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            {error && <p className="px-2 pt-2 text-xs text-red-700">{error}</p>}
            <div className="flex justify-end gap-2 px-2 pt-2">
              <button type="button" onClick={closePanel} className="btn-secondary text-xs">
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={pending} className="btn-primary text-xs disabled:opacity-50">
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
