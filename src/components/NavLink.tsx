"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ICONS } from "./icons";

export function NavLink({
  href,
  label,
  iconKey,
  onNavigate,
}: {
  href: string;
  label: string;
  iconKey: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  const Icon = NAV_ICONS[iconKey];

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? "bg-white/10 text-brand-200" : "text-ink-200 hover:bg-white/5 hover:text-white"
      }`}
    >
      <span
        className={`absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand-400 transition-opacity ${
          active ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden="true"
      />
      {Icon && (
        <Icon
          size={20}
          weight={active ? "fill" : "regular"}
          className={active ? "text-brand-300" : "text-ink-400 group-hover:text-ink-100"}
          aria-hidden="true"
        />
      )}
      {label}
    </Link>
  );
}
