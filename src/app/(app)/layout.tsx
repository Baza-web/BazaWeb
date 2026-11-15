import Link from "next/link";
import type { Role } from "@prisma/client";
import { requireScopedSessionOrRedirect } from "@/lib/tenant-db";
import { ROLE_LABELS, canManageBilling } from "@/lib/rbac";
import { resolveEffectivePlan } from "@/lib/plans";
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
  { href: "/tasks", label: "Tasks", iconKey: "tasks" },
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
  { href: "/staff", label: "Staff", iconKey: "staff", roles: ["OWNER", "ADMIN", "MANAGER"] },
  { href: "/groups", label: "Groups", iconKey: "groups", roles: ["OWNER", "ADMIN", "MANAGER"] },
  { href: "/branches", label: "Branches", iconKey: "branches", roles: ["OWNER", "ADMIN"] },
  { href: "/brokers", label: "Brokers & Memos", iconKey: "brokers", roles: ["OWNER", "ADMIN"] },
  { href: "/billing", label: "Billing", iconKey: "billing", roles: ["OWNER"] },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, db } = await requireScopedSessionOrRedirect();

  const [unreadNotifications, unreadMessages, openAttendanceLog] = await Promise.all([
    db.notification.count({ where: { staffId: session.staffId, readAt: null } }),
    db.message.count({ where: { recipientId: session.staffId, readAt: null } }),
    db.attendanceLog.findFirst({ where: { staffId: session.staffId, clockOutAt: null } }),
  ]);

  const visibleNav = NAV.filter((item) => !item.roles || item.roles.includes(session.role));

  const organization = await db.organization.findUniqueOrThrow({
    where: { id: session.organizationId },
    select: { plan: true, status: true, trialEndsAt: true },
  });
  const effective = resolveEffectivePlan(organization);
  const showBillingBanner = organization.plan !== "self-hosted" && (effective.onTrial || organization.status === "PAST_DUE");

  return (
    <AppShell
      nav={visibleNav}
      roleLabel={ROLE_LABELS[session.role]}
      staffName={session.name}
      unreadMessages={unreadMessages}
      unreadNotifications={unreadNotifications}
      isClockedIn={Boolean(openAttendanceLog)}
      showClockButton={session.role !== "OWNER"}
      logoutAction={logout}
    >
      {showBillingBanner && (
        <div
          className={`-mx-4 -mt-4 mb-4 px-4 py-2 text-center text-sm sm:-mx-6 sm:-mt-6 sm:mb-6 sm:px-6 ${
            organization.status === "PAST_DUE" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {organization.status === "PAST_DUE" ? (
            <>Your last payment failed. {canManageBilling(session.role) ? <Link href="/billing" className="font-medium underline">Update billing</Link> : "Ask your Owner to update billing"} to avoid losing access.</>
          ) : (
            <>
              Trial ends in {effective.trialDaysLeft} day{effective.trialDaysLeft === 1 ? "" : "s"}.{" "}
              {canManageBilling(session.role) && (
                <Link href="/billing" className="font-medium underline">
                  Choose a plan
                </Link>
              )}
            </>
          )}
        </div>
      )}
      {children}
    </AppShell>
  );
}
