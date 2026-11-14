import type { Role } from "@prisma/client";
import { requireSessionOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/rbac";
import { AppShell } from "@/components/AppShell";
import { logout } from "./actions";

const NAV: { href: string; label: string; iconKey: string; roles?: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", iconKey: "dashboard" },
  { href: "/inventory", label: "Inventory", iconKey: "inventory" },
  { href: "/customers", label: "Customers", iconKey: "customers" },
  { href: "/sales", label: "Sales", iconKey: "sales", roles: ["OWNER", "ADMIN", "MANAGER", "SALES"] },
  {
    href: "/accounting",
    label: "Accounting",
    iconKey: "accounting",
    roles: ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"],
  },
  { href: "/tasks", label: "Tasks", iconKey: "tasks" },
  { href: "/inbox", label: "Inbox", iconKey: "inbox" },
  { href: "/staff", label: "Staff", iconKey: "staff", roles: ["OWNER", "ADMIN"] },
  { href: "/branches", label: "Branches", iconKey: "branches", roles: ["OWNER", "ADMIN"] },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSessionOrRedirect();

  const [unreadNotifications, unreadMessages] = await Promise.all([
    db.notification.count({ where: { staffId: session.staffId, readAt: null } }),
    db.message.count({ where: { recipientId: session.staffId, readAt: null } }),
  ]);

  const visibleNav = NAV.filter((item) => !item.roles || item.roles.includes(session.role));

  return (
    <AppShell
      nav={visibleNav}
      roleLabel={ROLE_LABELS[session.role]}
      staffName={session.name}
      unreadMessages={unreadMessages}
      unreadNotifications={unreadNotifications}
      logoutAction={logout}
    >
      {children}
    </AppShell>
  );
}
