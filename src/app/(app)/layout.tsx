import type { Role } from "@prisma/client";
import { requireSessionOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS, canEditNavOrder } from "@/lib/rbac";
import { getNavOrder, applyNavOrder } from "@/lib/navOrder";
import { AppShell } from "@/components/AppShell";
import { logout, updateNavOrder } from "./actions";

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
  // WhatsApp Orders: hidden from nav for now per owner request (Meta Business
  // API setup not finished yet) — also blocked in middleware.ts. Remove both
  // to bring it back once it's actually in use.
  {
    href: "/targets",
    label: "Targets",
    iconKey: "targets",
    roles: ["OWNER", "ADMIN", "MANAGER", "SALES"],
  },
  {
    href: "/accounting",
    label: "Accounting",
    iconKey: "accounting",
    roles: ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"],
  },
  {
    href: "/reports",
    label: "Reports",
    iconKey: "reports",
    roles: ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"],
  },
  { href: "/tasks", label: "Project and Tasks", iconKey: "tasks" },
  { href: "/orders", label: "Orders Handling", iconKey: "orders" },
  {
    href: "/workshop",
    label: "Workshop & Supplies",
    iconKey: "workshop",
    roles: ["OWNER", "ADMIN", "MANAGER", "CRAFTSMAN"],
  },
  {
    href: "/qr",
    label: "QR Management",
    iconKey: "qr",
    roles: ["OWNER", "ADMIN", "MANAGER"],
  },
  {
    href: "/repairs",
    label: "Repairs & Custom Orders",
    iconKey: "repairs",
    roles: ["OWNER", "ADMIN", "MANAGER", "SALES", "CRAFTSMAN"],
  },
  {
    href: "/purchasing",
    label: "Purchasing",
    iconKey: "purchasing",
    roles: ["OWNER", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT"],
  },
  { href: "/leave", label: "Leave", iconKey: "leave" },
  { href: "/attendance", label: "Attendance", iconKey: "attendance" },
  { href: "/inbox", label: "Inbox", iconKey: "inbox" },
  { href: "/email", label: "Email", iconKey: "email" },
  { href: "/staff", label: "Staff", iconKey: "staff", roles: ["OWNER", "ADMIN", "MANAGER"] },
  { href: "/groups", label: "Groups", iconKey: "groups", roles: ["OWNER", "ADMIN", "MANAGER"] },
  { href: "/branches", label: "Branches", iconKey: "branches", roles: ["OWNER", "ADMIN"] },
  { href: "/brands", label: "Brands", iconKey: "brands", roles: ["OWNER", "ADMIN"] },
  { href: "/brokers", label: "Brokers & Memos", iconKey: "brokers", roles: ["OWNER", "ADMIN"] },
  { href: "/deletion-requests", label: "Deletion requests", iconKey: "deletions", roles: ["OWNER", "ADMIN"] },
  { href: "/edit-requests", label: "Edit requests", iconKey: "edits", roles: ["OWNER", "ADMIN"] },
  // Creative Hub: hidden from nav for now per owner request (moving to a
  // separate growth.baza-boutique.com app) — also blocked in middleware.ts.
  // Remove both to bring it back.
  { href: "/travel", label: "Travel & Experiences", iconKey: "travel", roles: ["OWNER", "ADMIN"] },
  { href: "/import", label: "Bulk import", iconKey: "import", roles: ["OWNER"] },
  { href: "/settings", label: "Settings", iconKey: "settings", roles: ["OWNER"] },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSessionOrRedirect();

  const [unreadNotifications, unreadMessages, openAttendanceLog, navOrder] = await Promise.all([
    db.notification.count({ where: { staffId: session.staffId, readAt: null } }),
    db.message.count({ where: { recipientId: session.staffId, readAt: null } }),
    db.attendanceLog.findFirst({ where: { staffId: session.staffId, clockOutAt: null } }),
    getNavOrder(),
  ]);

  const visibleNav = applyNavOrder(
    NAV.filter((item) => !item.roles || item.roles.some((r) => session.roles.includes(r))),
    navOrder,
  );

  return (
    <AppShell
      nav={visibleNav}
      roleLabel={ROLE_LABELS[session.role]}
      staffName={session.name}
      unreadMessages={unreadMessages}
      unreadNotifications={unreadNotifications}
      isClockedIn={Boolean(openAttendanceLog)}
      showClockButton={!session.roles.includes("OWNER")}
      logoutAction={logout}
      canEditNav={canEditNavOrder(session.roles)}
      updateNavOrderAction={updateNavOrder}
    >
      {children}
    </AppShell>
  );
}
