"use client";

import { useState, useTransition } from "react";
import { NavLink } from "./NavLink";
import { NAV_ICONS } from "./icons";
import { PencilSimple, Check, X, DotsSixVertical } from "./icons";

type NavItem = { href: string; label: string; iconKey: string };

export function SidebarNav({
  nav,
  canEditNav,
  updateNavOrderAction,
  onNavigate,
}: {
  nav: NavItem[];
  canEditNav: boolean;
  updateNavOrderAction: (order: string[]) => Promise<void>;
  onNavigate?: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [items, setItems] = useState(nav);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function startEditing() {
    setItems(nav);
    setEditMode(true);
  }

  function cancelEditing() {
    setItems(nav);
    setEditMode(false);
  }

  function save() {
    startTransition(async () => {
      await updateNavOrderAction(items.map((i) => i.href));
      setEditMode(false);
    });
  }

  function moveItem(from: number, to: number) {
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  if (!editMode) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4">
          {items.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} iconKey={item.iconKey} onNavigate={onNavigate} />
          ))}
        </nav>
        {canEditNav && (
          <button
            type="button"
            onClick={startEditing}
            className="mx-4 mt-2 flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-ink-400 hover:bg-white/5 hover:text-white"
          >
            <PencilSimple size={15} aria-hidden="true" />
            Edit sidebar order
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 shrink-0 px-4">
        <p className="mb-2 text-xs text-ink-400">Drag to reorder, then Save.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Check size={14} aria-hidden="true" />
            {pending ? "Saving…" : "Save order"}
          </button>
          <button
            type="button"
            onClick={cancelEditing}
            disabled={pending}
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-ink-200 hover:bg-white/20 disabled:opacity-50"
          >
            <X size={14} aria-hidden="true" />
            Cancel
          </button>
        </div>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4">
        {items.map((item, i) => {
          const Icon = NAV_ICONS[item.iconKey];
          return (
            <li
              key={item.href}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== i) moveItem(dragIndex, i);
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`flex cursor-grab items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-200 active:cursor-grabbing ${
                dragIndex === i ? "bg-white/10 opacity-60" : "bg-white/5"
              }`}
            >
              <DotsSixVertical size={16} className="shrink-0 text-ink-400" aria-hidden="true" />
              {Icon && <Icon size={18} className="shrink-0 text-ink-400" aria-hidden="true" />}
              <span className="truncate">{item.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
