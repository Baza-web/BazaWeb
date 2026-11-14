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
  {
    href: "/sales",
    label: "Sales",
    iconKey: "sales",
    roles: ["OWNER", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT"],
  },
  {
    href: "/accounting",
    label: "Accounting",
    iconKey: "accounting",
    roles: ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"],
  },
  { href: "/tasks", label: "Tasks", iconKey: "tasks" },
  { href: "/leave", label: "Leave", iconKey: "leave" },
  { href: "/attendance", label: "Attendance", iconKey: "attendance" },
  { href: "/inbox", label: "Inbox", iconKey: "inbox" },
  { href: "/staff", label: "Staff", iconKey: "staff", roles: ["OWNER", "ADMIN", "MANAGER"] },
  { href: "/branches", label: "Branches", iconKey: "branches", roles: ["OWNER", "ADMIN"] },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSessionOrRedirect();

  const [unreadNotifications, unreadMessages, openAttendanceLog] = await Promise.all([
    db.notification.count({ where: { staffId: session.staffId, readAt: null } }),
    db.message.count({ where: { recipientId: session.staffId, readAt: null } }),
    db.attendanceLog.findFirst({ where: { staffId: session.staffId, clockOutAt: null } }),
  ]);

  const visibleNav = NAV.filter((item) => !item.roles || item.roles.includes(session.role));

  return (
    <AppShell
      nav={visibleNav}
      roleLabel={ROLE_LABELS[session.role]}
      staffName={session.name}
      unreadMessages={unreadMessages}
      unreadNotifications={unreadNotifications}
      isClockedIn={Boolean(openAttendanceLog)}
      logoutAction={logout}
    >
      {children}
    </AppShell>
  );
}
