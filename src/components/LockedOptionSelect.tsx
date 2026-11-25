"use client";

import { useState, useTransition } from "react";
import { addInventoryAttributeOption } from "@/app/(app)/inventory/actions";

/**
 * A <select> backed by a locked-but-extensible vocabulary (see InventoryAttributeOption):
 * pick an existing value, or choose "+ Add new..." to add one on the fly. Renders a real
 * <select name={name}> (or hidden input while adding) so it submits correctly inside any
 * surrounding <form>, including one driven by a server action.
 */
export function LockedOptionSelect({
  name,
  kind,
  options,
  defaultValue,
  required,
  disabled,
  allowEmpty,
  placeholder = "Select…",
}: {
  name: string;
  kind: "GEMSTONE_TYPE" | "CLARITY" | "CUT" | "CERTIFICATION";
  options: string[];
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  allowEmpty?: boolean;
  placeholder?: string;
}) {
  const [choices, setChoices] = useState(options);
  const [value, setValue] = useState(defaultValue ?? "");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("name", trimmed);
      try {
        const result = await addInventoryAttributeOption(fd);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setChoices((prev) => (prev.includes(result.name) ? prev : [...prev, result.name].sort((a, b) => a.localeCompare(b))));
        setValue(result.name);
        setAdding(false);
        setNewName("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't add that.");
      }
    });
  }

  if (adding) {
    return (
      <div>
        <div className="flex gap-2">
          <input
            className="input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="New name…"
            autoFocus
            disabled={disabled || pending}
          />
          <button type="button" className="btn-secondary shrink-0 text-sm" onClick={handleAdd} disabled={disabled || pending}>
            {pending ? "Adding…" : "Add"}
          </button>
          <button
            type="button"
            className="btn-secondary shrink-0 text-sm"
            onClick={() => {
              setAdding(false);
              setNewName("");
              setError(null);
            }}
            disabled={disabled || pending}
          >
            Cancel
          </button>
        </div>
        <input type="hidden" name={name} value={value} />
        {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <select
        className="input"
        name={name}
        required={required}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          if (e.target.value === "__add__") {
            setAdding(true);
            return;
          }
          setValue(e.target.value);
        }}
      >
        {allowEmpty ? (
          <option value="">—</option>
        ) : (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {choices.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value="__add__">+ Add new…</option>
      </select>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
