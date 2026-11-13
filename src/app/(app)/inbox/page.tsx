import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";

export default async function InboxPage() {
  const session = await requireSessionOrRedirect();

  const [staff, messages] = await Promise.all([
    db.staff.findMany({
      where: { id: { not: session.staffId }, active: true },
      orderBy: { name: "asc" },
    }),
    db.message.findMany({
      where: { OR: [{ senderId: session.staffId }, { recipientId: session.staffId }] },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const byContact = new Map<string, { last: (typeof messages)[number]; unread: number }>();
  for (const m of messages) {
    const otherId = m.senderId === session.staffId ? m.recipientId : m.senderId;
    const existing = byContact.get(otherId);
    const isUnread = m.recipientId === session.staffId && !m.readAt;
    if (!existing) {
      byContact.set(otherId, { last: m, unread: isUnread ? 1 : 0 });
    } else if (isUnread) {
      existing.unread += 1;
    }
  }

  const contacts = staff
    .map((s) => ({ staff: s, thread: byContact.get(s.id) }))
    .sort((a, b) => {
      const at = a.thread?.last.createdAt.getTime() ?? 0;
      const bt = b.thread?.last.createdAt.getTime() ?? 0;
      return bt - at;
    });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Inbox</h1>

      <div className="card divide-y divide-stone-100 p-0">
        {contacts.map(({ staff: s, thread }) => (
          <Link
            key={s.id}
            href={`/inbox/${s.id}`}
            className="flex items-center justify-between px-5 py-3 hover:bg-stone-50"
          >
            <div>
              <p className="font-medium">{s.name}</p>
              {thread && (
                <p className="max-w-sm truncate text-sm text-stone-500">
                  {thread.last.body}
                </p>
              )}
            </div>
            <div className="text-right">
              {thread && <p className="text-xs text-stone-400">{formatDateTime(thread.last.createdAt)}</p>}
              {thread && thread.unread > 0 && (
                <span className="badge mt-1 bg-brand-600 text-white">{thread.unread}</span>
              )}
            </div>
          </Link>
        ))}
        {contacts.length === 0 && <p className="px-5 py-6 text-center text-stone-400">No colleagues yet.</p>}
      </div>
    </div>
  );
}
