import "server-only";
import crypto from "crypto";
import type { Prisma, Sale, SaleItem, InventoryItem } from "@prisma/client";

type TxClient = Prisma.TransactionClient;
type SaleWithItems = Sale & { items: (SaleItem & { inventoryItem: InventoryItem })[] };

function orderNumber() {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `ORD-${Date.now().toString(36).toUpperCase()}-${random}`;
}

/** Used only as the sentinel deadline when a sale has no required dispatch date — paired with `deadlineNotSet: true`, which every date/priority display checks first, so this value itself is never shown or used to compute urgency. */
function farFutureSentinel() {
  return new Date(Date.now() + 100 * 365 * 86_400_000);
}

function buildProductSummary(items: SaleWithItems["items"]) {
  if (items.length === 0) return "Sale with no line items";
  return items.map((i) => `${i.quantity}x ${i.inventoryItem.name} (${i.inventoryItem.sku})`).join(", ");
}

function totalQuantity(items: SaleWithItems["items"]) {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

/**
 * Creates — or, if one already exists, updates — the Order linked to a
 * Sale. This is the single integration point for the Sales → Orders
 * Handling automation (section 1/2/4 of the spec):
 *
 * - Always called inside the same transaction as the Sale write it's
 *   reacting to (sale creation, or an approved Sale edit being applied),
 *   so it's atomic by construction: either both rows land together or
 *   neither does. There is no separate "pending sync" state to retry in
 *   normal operation — see OrderSyncStatus's doc comment in schema.prisma.
 * - Idempotent via `Order.relatedSaleId`'s unique constraint: calling this
 *   twice for the same sale updates the one existing order, it can never
 *   create a second one.
 * - One-directional: Sales fields flow into the Order; nothing here ever
 *   writes back to the Sale, so no sync loop is possible.
 * - Fulfilment-only Order fields (status, progress, assignment beyond the
 *   initial seed, dispatch tracking) are never touched here on update —
 *   only the commercial/fulfilment-request fields Sales owns.
 */
export async function syncOrderFromSale(
  tx: TxClient,
  sale: SaleWithItems,
  opts: { initialPrimaryStaffId?: string; initialSupportingStaffIds?: string[] } = {},
): Promise<{ orderId: string; created: boolean; deadlineChanged: boolean; notifyTargets: string[] }> {
  const existing = await tx.order.findUnique({ where: { relatedSaleId: sale.id } });

  const deadlineNotSet = !sale.requiredDispatchDate;
  const deadline = sale.requiredDispatchDate ?? farFutureSentinel();

  const syncedFields = {
    brandId: sale.brandId,
    customerId: sale.customerId,
    productOrService: buildProductSummary(sale.items),
    quantity: totalQuantity(sale.items),
    customizationRequirements: sale.customizationRequirements,
    internalInstructions: sale.fulfilmentInstructions,
    customerInstructions: sale.customerDeliveryInstructions,
    department: sale.responsibleDepartment,
    branchId: sale.branchId,
    currentDeadline: deadline,
    deadlineNotSet,
    syncStatus: "SYNCED" as const,
    syncError: null,
  };

  if (existing) {
    const dispatchDateReallyChanged =
      !existing.deadlineNotSet && !deadlineNotSet && deadline.getTime() !== existing.currentDeadline.getTime();

    await tx.order.update({
      where: { id: existing.id },
      data: {
        ...syncedFields,
        ...(dispatchDateReallyChanged
          ? {
              deadlineHistory: {
                create: {
                  previousDeadline: existing.currentDeadline,
                  newDeadline: deadline,
                  reason: "Required dispatch date changed in Sales",
                  changedById: sale.staffId,
                },
              },
            }
          : {}),
      },
    });
    return {
      orderId: existing.id,
      created: false,
      deadlineChanged: dispatchDateReallyChanged,
      notifyTargets: dispatchDateReallyChanged ? [existing.primaryStaffId] : [],
    };
  }

  const initialStatus = opts.initialPrimaryStaffId ? "ASSIGNED" : "PENDING_ASSIGNMENT";
  const created = await tx.order.create({
    data: {
      ...syncedFields,
      orderNumber: orderNumber(),
      orderType: "Sales Order",
      orderDate: sale.createdAt,
      originalDeadline: deadline,
      status: initialStatus,
      primaryStaffId: opts.initialPrimaryStaffId ?? sale.staffId,
      createdById: sale.staffId,
      originalSalespersonId: sale.staffId,
      relatedSaleId: sale.id,
      supportingStaff: opts.initialSupportingStaffIds?.length
        ? { connect: opts.initialSupportingStaffIds.map((id) => ({ id })) }
        : undefined,
      statusHistory: {
        create: {
          toStatus: initialStatus,
          changedById: sale.staffId,
          reason: `Automatically created from sale ${sale.invoiceNumber}`,
        },
      },
    },
  });
  return { orderId: created.id, created: true, deadlineChanged: false, notifyTargets: [] };
}

/**
 * Finds every Sale that doesn't yet have a linked Order and syncs it — used
 * both for the one-time historical backfill (section 12) and as the
 * "retry mechanism" (section 11) for any sale that is somehow missing its
 * order (there's no ordinary code path that leaves one in that state, since
 * creation is transactional, but this makes recovering from a manual DB
 * intervention or a pre-this-feature sale a single safe, idempotent call).
 * Safe to run repeatedly: a sale with a linked order is simply skipped.
 */
export async function backfillUnsyncedSales(tx: TxClient, limit = 500): Promise<{ synced: number; saleIds: string[] }> {
  const unsynced = await tx.sale.findMany({
    where: { order: { is: null } },
    include: { items: { include: { inventoryItem: true } } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const saleIds: string[] = [];
  for (const sale of unsynced) {
    const { orderId } = await syncOrderFromSale(tx, sale);
    saleIds.push(orderId);
  }
  return { synced: unsynced.length, saleIds };
}
