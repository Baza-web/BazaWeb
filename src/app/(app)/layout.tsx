import type { Role } from "@prisma/client";
import { requireSessionOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/rbac";
import { NavLink } from "@/components/NavLink";
import { logout } from "./actions";

const NAV: { href: string; label: string; roles?: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/inventory", label: "Inventory" },
  { href: "/customers", label: "Customers" },
  { href: "/sales", label: "Sales", roles: ["OWNER", "ADMIN", "MANAGER", "SALES"] },
  { href: "/accounting", label: "Accounting", roles: ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"] },
  { href: "/tasks", label: "Tasks" },
  { href: "/inbox", label: "Inbox" },
  { href: "/staff", label: "Staff", roles: ["OWNER", "ADMIN"] },
  { href: "/branches", label: "Branches", roles: ["OWNER", "ADMIN"] },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSessionOrRedirect();

  const [unreadNotifications, unreadMessages] = await Promise.all([
    db.notification.count({ where: { staffId: session.staffId, readAt: null } }),
    db.message.count({ where: { recipientId: session.staffId, readAt: null } }),
  ]);

  const visibleNav = NAV.filter((item) => !item.roles || item.roles.includes(session.role));

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-stone-200 bg-white px-4 py-6">
        <div className="mb-6 px-2">
          <h1 className="text-lg font-semibold text-brand-700">Baza ERP</h1>
        </div>
        <nav className="space-y-1">
          {visibleNav.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-3">
          <div className="text-sm text-stone-500">{ROLE_LABELS[session.role]}</div>
          <div className="flex items-center gap-4">
            <a href="/inbox" className="relative text-sm text-stone-600 hover:text-brand-700" title="Inbox">
              Inbox
              {unreadMessages > 0 && (
                <span className="badge ml-1 bg-brand-600 text-white">{unreadMessages}</span>
              )}
            </a>
            <a
              href="/notifications"
              className="relative text-sm text-stone-600 hover:text-brand-700"
              title="Notifications"
            >
              Notifications
              {unreadNotifications > 0 && (
                <span className="badge ml-1 bg-brand-600 text-white">{unreadNotifications}</span>
              )}
            </a>
            <span className="text-sm font-medium text-stone-800">{session.name}</span>
            <form action={logout}>
              <button type="submit" className="btn-secondary text-xs">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
