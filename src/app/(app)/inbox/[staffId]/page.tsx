import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import { sendMessage, markConversationRead } from "../actions";

export default async function ConversationPage({ params }: { params: Promise<{ staffId: string }> }) {
  const session = await requireSessionOrRedirect();
  const { staffId } = await params;

  const other = await db.staff.findUnique({ where: { id: staffId } });
  if (!other) notFound();

  await markConversationRead(staffId);

  const messages = await db.message.findMany({
    where: {
      OR: [
        { senderId: session.staffId, recipientId: staffId },
        { senderId: staffId, recipientId: session.staffId },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex max-w-2xl flex-col space-y-4">
      <h1 className="text-xl font-semibold">{other.name}</h1>

      <div className="card max-h-[60vh] space-y-3 overflow-y-auto">
        {messages.map((m) => {
          const mine = m.senderId === session.staffId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                  mine ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-800"
                }`}
              >
                <p>{m.body}</p>
                <p className={`mt-1 text-[10px] ${mine ? "text-brand-100" : "text-stone-400"}`}>
                  {formatDateTime(m.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
        {messages.length === 0 && <p className="text-center text-stone-400">No messages yet. Say hello.</p>}
      </div>

      <form action={sendMessage.bind(null, staffId)} className="flex gap-2">
        <input className="input" name="body" placeholder="Type a message…" required autoFocus />
        <button type="submit" className="btn-primary">
          Send
        </button>
      </form>
    </div>
  );
}
