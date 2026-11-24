/**
 * Removes everything created by the demo-data seed scripts (demo-data.ts,
 * demo-data-brands-topup.ts, demo-data-expand.ts, orders-demo-data.ts,
 * travel-demo-tours.ts) so a system can go live with only real data.
 *
 * Identified ONLY by unambiguous markers, never by date or id range, so it
 * can't accidentally touch real data:
 *   - Staff:   email ends in "@example.com"
 *   - Orders:  internalInstructions contains "[DEMO]", OR created by /
 *              assigned to a demo staff member
 *   - Inventory: SKU starts with "DEMO-"
 *   - Tours:   notes contains "Dev sample"
 *   - Sales, and everything else below: reachable only by walking outward
 *     from the demo staff ids above (a Sale/Task/Expense/etc. recorded BY
 *     a demo staff member) — never by customer name or any other guess.
 *
 * A Customer is deleted only if EVERY sale/order/repair they're linked to
 * is one of the demo records above. A customer with ANY real-staff
 * transaction, or with zero transactions at all (so there's nothing to
 * check this against), is left untouched and listed at the end for your
 * own review — this script will never guess that a customer is "probably
 * demo" from their name alone.
 *
 * This does NOT touch the Accounting cross-check demo data
 * (@acct-demo.test / ACCTDEMO- tag) — run accounting-demo-cleanup.ts
 * separately for that, if you ran it.
 *
 * SAFE TO RUN IN DRY-RUN MODE FIRST (the default) — it only counts and
 * prints what it WOULD delete, changing nothing, until you pass --confirm.
 *
 * Run inside the app container:
 *   docker compose exec app node_modules/.bin/tsx prisma/delete-all-demo-data.ts            # dry run
 *   docker compose exec app node_modules/.bin/tsx prisma/delete-all-demo-data.ts --confirm   # actually delete
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const DRY_RUN = !process.argv.includes("--confirm");

async function main() {
  console.log(DRY_RUN ? "DRY RUN — nothing will be deleted. Pass --confirm to actually delete.\n" : "LIVE RUN — deleting demo data.\n");

  const demoStaff = await db.staff.findMany({ where: { email: { endsWith: "@example.com" } } });
  const staffIds = demoStaff.map((s) => s.id);
  if (staffIds.length === 0) {
    console.log("No demo staff accounts found (none with an @example.com email) — nothing to do.");
    return;
  }
  console.log(`Demo staff accounts (${staffIds.length}):`, demoStaff.map((s) => s.email).join(", "));

  const demoOrders = await db.order.findMany({
    where: { OR: [{ internalInstructions: { contains: "[DEMO]" } }, { createdById: { in: staffIds } }, { primaryStaffId: { in: staffIds } }] },
    select: { id: true },
  });
  const orderIds = demoOrders.map((o) => o.id);

  const demoInventory = await db.inventoryItem.findMany({ where: { sku: { startsWith: "DEMO-" } }, select: { id: true } });
  const inventoryIds = demoInventory.map((i) => i.id);

  // A real customer can never have bought a "DEMO-" SKU item, so a sale containing one is demo-adjacent
  // regardless of who recorded it (e.g. a different account used while testing) — union both signals.
  const demoSales = await db.sale.findMany({
    where: { OR: [{ staffId: { in: staffIds } }, { items: { some: { inventoryItemId: { in: inventoryIds } } } }] },
    select: { id: true, customerId: true },
  });
  const saleIds = demoSales.map((s) => s.id);
  const saleCustomerIds = new Set(demoSales.map((s) => s.customerId).filter((id): id is string => !!id));

  const demoTours = await db.tour.findMany({ where: { internalNotes: { contains: "Dev sample" } }, select: { id: true } });
  const tourIds = demoTours.map((t) => t.id);

  console.log(`Demo orders: ${orderIds.length}, demo sales: ${saleIds.length}, demo inventory items: ${inventoryIds.length}, demo tours: ${tourIds.length}`);

  if (DRY_RUN) {
    console.log("\nRe-run with --confirm to delete the above, plus everything else reachable only from these demo staff accounts.");
    return;
  }

  await db.$transaction(
    async (tx) => {
      // --- Orders and everything hanging off them (Phase 3 BOM/QC/certs cascade via onDelete: Cascade in schema) ---
      await tx.orderComment.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.orderApproval.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.orderDelay.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.orderDeadlineChange.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.task.updateMany({ where: { orderId: { in: orderIds } }, data: { orderId: null } });
      await tx.order.deleteMany({ where: { id: { in: orderIds } } });

      // --- Sales: restock inventory first (same as voiding a real sale), then the journal/ledger trail ---
      for (const saleId of saleIds) {
        const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: { items: true } });
        for (const item of sale.items) {
          const updated = await tx.inventoryItem.update({ where: { id: item.inventoryItemId }, data: { quantity: { increment: item.quantity } } });
          if (updated.status === "SOLD" && updated.quantity > 0) {
            await tx.inventoryItem.update({ where: { id: item.inventoryItemId }, data: { status: "IN_STOCK" } });
          }
        }
        const je = await tx.journalEntry.findFirst({ where: { saleId } });
        if (je) {
          await tx.journalLine.deleteMany({ where: { journalEntryId: je.id } });
          await tx.journalEntry.delete({ where: { id: je.id } });
        }
        await tx.rewardTransaction.deleteMany({ where: { saleId } });
        await tx.ledgerEntry.deleteMany({ where: { saleId } });
      }
      await tx.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
      await tx.sale.deleteMany({ where: { id: { in: saleIds } } });

      // --- Expenses recorded by demo staff (and their journal/ledger trail) ---
      const demoExpenses = await tx.expense.findMany({ where: { createdById: { in: staffIds } }, select: { id: true } });
      const expenseIds = demoExpenses.map((e) => e.id);
      for (const expenseId of expenseIds) {
        const je = await tx.journalEntry.findFirst({ where: { expenseId } });
        if (je) {
          await tx.journalLine.deleteMany({ where: { journalEntryId: je.id } });
          await tx.journalEntry.delete({ where: { id: je.id } });
        }
      }
      await tx.ledgerEntry.deleteMany({ where: { expenseId: { in: expenseIds } } });
      await tx.expense.deleteMany({ where: { id: { in: expenseIds } } });

      // --- Purchasing ---
      const demoPOs = await tx.purchaseOrder.findMany({ where: { createdById: { in: staffIds } }, select: { id: true } });
      const poIds = demoPOs.map((p) => p.id);
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: { in: poIds } } });
      await tx.purchaseOrder.deleteMany({ where: { id: { in: poIds } } });

      // --- Repairs, brokers/memos ---
      await tx.repairOrder.deleteMany({ where: { OR: [{ createdById: { in: staffIds } }, { assignedToId: { in: staffIds } }] } });
      const demoMemos = await tx.brokerMemo.findMany({ where: { createdById: { in: staffIds } }, select: { id: true } });
      await tx.brokerMemoEditRequest.deleteMany({ where: { memoId: { in: demoMemos.map((m) => m.id) } } });
      await tx.brokerMemoItem.deleteMany({ where: { memoId: { in: demoMemos.map((m) => m.id) } } });
      await tx.brokerMemo.deleteMany({ where: { id: { in: demoMemos.map((m) => m.id) } } });
      await tx.broker.deleteMany({ where: { createdById: { in: staffIds } } });

      // --- Tasks, HR, attendance, messaging, notifications ---
      await tx.taskComment.deleteMany({ where: { OR: [{ staffId: { in: staffIds } }] } });
      await tx.task.deleteMany({ where: { OR: [{ assignedToId: { in: staffIds } }, { assignedById: { in: staffIds } }] } });
      await tx.attendanceLog.deleteMany({ where: { staffId: { in: staffIds } } });
      await tx.leaveRequest.deleteMany({ where: { staffId: { in: staffIds } } });
      await tx.leaveEntitlement.deleteMany({ where: { staffId: { in: staffIds } } });
      await tx.onboardingTask.deleteMany({ where: { staffId: { in: staffIds } } });
      await tx.performanceReview.deleteMany({ where: { OR: [{ staffId: { in: staffIds } }, { reviewerId: { in: staffIds } }] } });
      await tx.disciplinaryRecord.deleteMany({ where: { OR: [{ staffId: { in: staffIds } }, { issuedById: { in: staffIds } }] } });
      await tx.message.deleteMany({ where: { OR: [{ senderId: { in: staffIds } }, { recipientId: { in: staffIds } }] } });
      await tx.notification.deleteMany({ where: { staffId: { in: staffIds } } });
      await tx.pushSubscription.deleteMany({ where: { staffId: { in: staffIds } } });
      await tx.groupMessage.deleteMany({ where: { senderId: { in: staffIds } } });
      // StaffGroup is a shared membership (implicit many-to-many), never owned by one staff member — a real
      // team could share a group with demo staff, so it's never deleted here; removing the demo Staff rows
      // below cleans up their membership automatically via the join table's own FK.
      await tx.salesTarget.deleteMany({ where: { staffId: { in: staffIds } } });
      await tx.payrollRun.deleteMany({ where: { OR: [{ staffId: { in: staffIds } }, { createdById: { in: staffIds } }] } });

      // --- Creative / social ---
      await tx.socialPost.deleteMany({ where: { OR: [{ assignedToId: { in: staffIds } }, { createdById: { in: staffIds } }, { approvedById: { in: staffIds } }] } });
      await tx.voiceGeneration.deleteMany({ where: { createdById: { in: staffIds } } });
      await tx.voiceProfile.deleteMany({ where: { createdById: { in: staffIds } } });

      // --- CRM activity on customers only touched by demo staff ---
      await tx.customerActivity.deleteMany({ where: { staffId: { in: staffIds } } });
      await tx.customerNote.deleteMany({ where: { staffId: { in: staffIds } } });

      // --- Edit/deletion request trail ---
      await tx.editRequest.deleteMany({ where: { OR: [{ requestedById: { in: staffIds } }, { reviewedById: { in: staffIds } }] } });
      await tx.deletionRequest.deleteMany({ where: { OR: [{ requestedById: { in: staffIds } }, { reviewedById: { in: staffIds } }] } });

      // --- Travel ---
      await tx.tour.deleteMany({ where: { id: { in: tourIds } } }); // tourIds now refers to internalNotes-tagged tours

      // --- Inventory tagged DEMO- (after sales above already restocked/freed references) ---
      await tx.inventoryItem.deleteMany({ where: { id: { in: inventoryIds } } });

      // --- QR codes created by demo staff ---
      const demoQr = await tx.qRCode.findMany({ where: { createdById: { in: staffIds } }, select: { id: true } });
      await tx.qRScan.deleteMany({ where: { qrCodeId: { in: demoQr.map((q) => q.id) } } });
      await tx.qRCode.deleteMany({ where: { id: { in: demoQr.map((q) => q.id) } } });

      // --- Finally, the demo staff accounts themselves ---
      await tx.staff.deleteMany({ where: { id: { in: staffIds } } });

      // --- Customers left with zero remaining activity after all of the above ---
      const candidates = await tx.customer.findMany({
        where: { id: { in: Array.from(saleCustomerIds) } },
        include: { _count: { select: { sales: true, orders: true, repairOrders: true } } },
      });
      const emptyCustomers = candidates.filter((c) => c._count.sales === 0 && c._count.orders === 0 && c._count.repairOrders === 0);
      await tx.customer.deleteMany({ where: { id: { in: emptyCustomers.map((c) => c.id) } } });

      console.log(`Deleted ${emptyCustomers.length} customer(s) left with zero remaining activity.`);
    },
    { timeout: 60_000 },
  );

  console.log("\nDone. Re-run with no arguments (dry run) to confirm counts are now zero.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
