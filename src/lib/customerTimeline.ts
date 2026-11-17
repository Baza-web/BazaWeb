import "server-only";
import { db } from "./db";
import type { CustomerActivityType } from "@prisma/client";

export type TimelineEntry =
  | { kind: "NOTE"; id: string; at: Date; staffName: string; body: string; followUpAt: Date | null; followUpDone: boolean }
  | { kind: "EMAIL"; id: string; at: Date; staffName: string; subject: string }
  | { kind: "SALE"; id: string; at: Date; invoiceNumber: string; total: number }
  | { kind: "REPAIR"; id: string; at: Date; type: string; description: string; status: string }
  | { kind: "ACTIVITY"; id: string; at: Date; staffName: string; type: CustomerActivityType; note: string };

/** Merges every record that touches this customer — notes, emails, sales, repairs, and logged calls/visits/stage changes — into one chronological feed. Each source keeps its own table (no new "everything" table); this just reads and interleaves them. */
export async function getCustomerTimeline(customerId: string): Promise<TimelineEntry[]> {
  const [notes, emails, sales, repairs, activities] = await Promise.all([
    db.customerNote.findMany({ where: { customerId }, include: { staff: true } }),
    db.emailLog.findMany({ where: { customerId }, include: { sentBy: true } }),
    db.sale.findMany({ where: { customerId } }),
    db.repairOrder.findMany({ where: { customerId } }),
    db.customerActivity.findMany({ where: { customerId }, include: { staff: true } }),
  ]);

  const entries: TimelineEntry[] = [
    ...notes.map((n) => ({
      kind: "NOTE" as const,
      id: n.id,
      at: n.createdAt,
      staffName: n.staff.name,
      body: n.body,
      followUpAt: n.followUpAt,
      followUpDone: n.followUpDone,
    })),
    ...emails.map((e) => ({ kind: "EMAIL" as const, id: e.id, at: e.createdAt, staffName: e.sentBy.name, subject: e.subject })),
    ...sales.map((s) => ({ kind: "SALE" as const, id: s.id, at: s.createdAt, invoiceNumber: s.invoiceNumber, total: s.total })),
    ...repairs.map((r) => ({
      kind: "REPAIR" as const,
      id: r.id,
      at: r.createdAt,
      type: r.type,
      description: r.description,
      status: r.status,
    })),
    ...activities.map((a) => ({
      kind: "ACTIVITY" as const,
      id: a.id,
      at: a.occurredAt,
      staffName: a.staff.name,
      type: a.type,
      note: a.note,
    })),
  ];

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}
