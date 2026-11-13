import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import { PushSubscribeButton } from "@/components/PushSubscribeButton";
import { markAllNotificationsRead } from "./actions";

export default async function NotificationsPage() {
  const session = await requireSessionOrRedirect();

  const notifications = await db.notification.findMany({
    where: { staffId: session.staffId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Notifications</h1>
        <form action={markAllNotificationsRead}>
          <button type="submit" className="btn-secondary text-xs">
            Mark all read
          </button>
        </form>
      </div>

      <div className="card">
        <PushSubscribeButton />
      </div>

      <div className="card divide-y divide-stone-100 p-0">
        {notifications.map((n) => (
          <a
            key={n.id}
            href={n.link ?? "#"}
            className={`block px-5 py-3 hover:bg-stone-50 ${!n.readAt ? "bg-brand-50/50" : ""}`}
          >
            <p className="font-medium">{n.title}</p>
            <p className="text-sm text-stone-500">{n.body}</p>
            <p className="text-xs text-stone-400">{formatDateTime(n.createdAt)}</p>
          </a>
        ))}
        {notifications.length === 0 && (
          <p className="px-5 py-6 text-center text-stone-400">No notifications yet.</p>
        )}
      </div>
    </div>
  );
}
