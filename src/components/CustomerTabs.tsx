"use client";

import { useState, type ReactNode } from "react";

export function CustomerTabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.id);

  return (
    <div>
      <div className="flex gap-1 border-b border-stone-200 print:hidden" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
            className={
              active === t.id
                ? "border-b-2 border-brand-600 px-4 py-2 text-sm font-medium text-brand-700"
                : "border-b-2 border-transparent px-4 py-2 text-sm text-stone-500 hover:text-stone-700"
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pt-4">
        {tabs.map((t) => (
          <div key={t.id} hidden={active !== t.id} className="space-y-6">
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}
