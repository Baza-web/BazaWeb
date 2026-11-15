import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canAccessCreativeHub, isCompanyWide, STAFF_MANAGER_ROLES } from "@/lib/rbac";
import { formatDateTime, initials } from "@/lib/utils";
import { TaskBoard } from "@/components/TaskBoard";
import { ContentCalendar } from "@/components/ContentCalendar";
import { sendGroupMessage } from "./actions";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function CreativeHubPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; brand?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  if (!canAccessCreativeHub(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const isManager = STAFF_MANAGER_ROLES.includes(session.role);

  const { month: monthParam, brand: brandParam } = await searchParams;
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    year = y;
    month = m - 1;
  }
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const prevMonth = new Date(year, month - 1, 1);
  const nextMonth = new Date(year, month + 1, 1);
  const pad2 = (n: number) => String(n).padStart(2, "0");

  const brands = await db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const selectedBrand =
    brands.find((b) => b.id === brandParam) ?? brands.find((b) => b.name === "Baza Boutique") ?? brands[0];
  const brandQuery = selectedBrand ? `&brand=${selectedBrand.id}` : "";

  const prevHref = `/creative?month=${prevMonth.getFullYear()}-${pad2(prevMonth.getMonth() + 1)}${brandQuery}`;
  const nextHref = `/creative?month=${nextMonth.getFullYear()}-${pad2(nextMonth.getMonth() + 1)}${brandQuery}`;
  const monthLabel = `${MONTH_NAMES[month]} ${year}`;

  const groups = selectedBrand
    ? await db.staffGroup.findMany({
        where: {
          isCreativeTeam: true,
          ...(isManager
            ? isCompanyWide(session.role)
              ? {}
              : { branchId: session.branchId ?? "__none__" }
            : { members: { some: { id: session.staffId } } }),
        },
        include: {
          members: true,
          branch: true,
          messages: { orderBy: { createdAt: "asc" }, take: 100, include: { sender: true } },
          tasks: {
            include: { assignedTo: true, assignedBy: true, group: { include: { members: true } } },
            orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
          },
          socialPosts: {
            where: {
              brandId: selectedBrand.id,
              OR: [{ scheduledAt: { gte: monthStart, lte: monthEnd } }, { scheduledAt: null }],
            },
            include: { assignedTo: true },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Creative Hub</h1>
          <p className="text-sm text-stone-500">
            Your creative team&apos;s projects, tasks, and planning — all in one place.
          </p>
        </div>
        {brands.length > 0 && (
          <form action="/creative" className="flex items-end gap-2">
            <input type="hidden" name="month" value={`${year}-${pad2(month + 1)}`} />
            <div>
              <label className="label">Brand</label>
              <select className="input" name="brand" defaultValue={selectedBrand?.id}>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-secondary">
              Switch
            </button>
          </form>
        )}
      </div>

      {brands.length === 0 && (
        <div className="card text-sm text-stone-500">
          No brands set up yet.{" "}
          {isManager ? (
            <Link href="/brands" className="text-brand-700 hover:underline">
              Add one in Brands
            </Link>
          ) : (
            "Ask an Admin to add one in Brands."
          )}{" "}
          first.
        </div>
      )}

      {brands.length > 0 && groups.length === 0 && (
        <div className="card text-sm text-stone-500">
          {isManager ? (
            <>
              No creative team yet.{" "}
              <Link href="/groups" className="text-brand-700 hover:underline">
                Create one in Groups
              </Link>{" "}
              and check &quot;Creative team&quot;.
            </>
          ) : (
            "You haven't been added to a creative team yet — ask an Admin to add you in Groups."
          )}
        </div>
      )}

      {groups.map((group) => {
        const boardTasks = group.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          type: t.type,
          priority: t.priority,
          status: t.status,
          dueDate: t.dueDate ? t.dueDate.toISOString() : null,
          assignedTo: { id: t.assignedTo.id, name: t.assignedTo.name },
          assignedBy: { id: t.assignedBy.id, name: t.assignedBy.name },
          group: t.group
            ? { id: t.group.id, name: t.group.name, members: t.group.members.map((m) => ({ id: m.id, name: m.name })) }
            : null,
        }));

        return (
          <div key={group.id} className="space-y-4">
            <div className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink-900">{group.name}</h2>
                {isCompanyWide(session.role) && <p className="text-xs text-stone-400">{group.branch.name}</p>}
              </div>
              <div className="flex -space-x-2">
                {group.members.map((m) => (
                  <span key={m.id} title={m.name} className="avatar h-8 w-8 border-2 border-white text-xs">
                    {initials(m.name)}
                  </span>
                ))}
                {group.members.length === 0 && <span className="text-xs text-stone-400">No members yet.</span>}
              </div>
              {isManager && (
                <Link href="/tasks" className="btn-secondary text-sm">
                  Assign a task
                </Link>
              )}
            </div>

            <div className="card">
              <h3 className="section-title mb-3">Team tasks</h3>
              <TaskBoard
                tasks={boardTasks}
                canEditAny={isManager}
                currentStaffId={session.staffId}
                staffOptions={[]}
                groupOptions={[]}
                branchOptions={[]}
                showBranchSelect={false}
                defaultBranchId=""
                canAssign={false}
              />
            </div>

            <div className="card">
              <h3 className="section-title mb-3">Content calendar — social media planning</h3>
              <ContentCalendar
                groupId={group.id}
                brandId={selectedBrand!.id}
                year={year}
                month={month}
                monthLabel={monthLabel}
                prevHref={prevHref}
                nextHref={nextHref}
                memberOptions={group.members.map((m) => ({ id: m.id, name: m.name }))}
                posts={group.socialPosts
                  .filter((p) => p.scheduledAt)
                  .map((p) => ({
                    id: p.id,
                    title: p.title,
                    platform: p.platform,
                    status: p.status,
                    scheduledAt: p.scheduledAt!.toISOString(),
                    assignedToName: p.assignedTo?.name ?? null,
                  }))}
              />

              {group.socialPosts.some((p) => !p.scheduledAt) && (
                <div className="mt-5 border-t border-stone-100 pt-4">
                  <h4 className="mb-2 text-sm font-medium text-stone-600">Ideas & drafts (not yet scheduled)</h4>
                  <ul className="space-y-1.5">
                    {group.socialPosts
                      .filter((p) => !p.scheduledAt)
                      .map((p) => (
                        <li key={p.id}>
                          <Link
                            href={`/creative/posts/${p.id}`}
                            className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm hover:bg-stone-100"
                          >
                            <span>{p.title}</span>
                            <span className="text-xs text-stone-400">
                              {p.status}
                              {p.assignedTo ? ` · ${p.assignedTo.name}` : ""}
                            </span>
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="card space-y-3">
              <h3 className="section-title">Team chat — planning & updates</h3>
              <div className="max-h-96 space-y-3 overflow-y-auto rounded-lg bg-stone-50 p-3">
                {group.messages.map((m) => {
                  const mine = m.senderId === session.staffId;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-sm rounded-lg px-3 py-2 text-sm ${
                          mine ? "bg-brand-600 text-white" : "bg-white text-stone-800 shadow-sm"
                        }`}
                      >
                        {!mine && <p className="mb-0.5 text-xs font-medium text-brand-700">{m.sender.name}</p>}
                        <p>{m.body}</p>
                        <p className={`mt-1 text-[10px] ${mine ? "text-brand-100" : "text-stone-400"}`}>
                          {formatDateTime(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {group.messages.length === 0 && (
                  <p className="text-center text-sm text-stone-400">No messages yet — say hello.</p>
                )}
              </div>
              <form action={sendGroupMessage.bind(null, group.id)} className="flex gap-2">
                <input className="input" name="body" placeholder="Post an update or plan…" required />
                <button type="submit" className="btn-primary">
                  Send
                </button>
              </form>
            </div>
          </div>
        );
      })}
    </div>
  );
}
