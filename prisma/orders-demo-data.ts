/**
 * Seeds realistic sample Orders for the Orders Handling module, so the
 * Order Command Centre, All Orders board, Delayed Orders, Pending
 * Approvals, and Completed Orders pages show real-looking activity
 * instead of all-zero stat tiles — without creating any fake staff,
 * customers, brands or branches. Every order reuses your actual active
 * staff, branches, brands and (if any exist) customers; it creates no new
 * people or company records, only order rows that reference them.
 *
 * Every seeded order's internal instructions start with "[DEMO]" so it's
 * easy to tell apart from a real order, and scope varies by design: some
 * overdue, some due today/within 24h/48h, some further out, two with a
 * reported delay, two pending approval, two completed (one on time, one
 * late) with one already-decided approval — enough to populate every
 * section of the dashboard and every sub-page meaningfully.
 *
 * Safe to run once on a live system: it checks for an existing "[DEMO]"
 * order first and does nothing if one is already there, so running it
 * twice is a no-op.
 *
 * Run inside the app container:
 *   docker compose exec app node_modules/.bin/tsx prisma/orders-demo-data.ts
 */
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const db = new PrismaClient();

function orderNumber() {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `ORD-${Date.now().toString(36).toUpperCase()}-${random}`;
}

function hoursFromNow(h: number) {
  return new Date(Date.now() + h * 3_600_000);
}

function daysFromNow(d: number) {
  return hoursFromNow(d * 24);
}

async function main() {
  const existing = await db.order.findFirst({ where: { internalInstructions: { startsWith: "[DEMO]" } } });
  if (existing) {
    console.log("Demo orders already exist — skipping. Nothing created.");
    return;
  }

  const owner = await db.staff.findFirst({ where: { role: "OWNER", active: true }, orderBy: { createdAt: "asc" } });
  if (!owner) {
    console.log("No active Owner account found — create one first, then re-run this script.");
    return;
  }

  const staff = await db.staff.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  const branches = await db.branch.findMany({ orderBy: { createdAt: "asc" } });
  const brands = await db.brand.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  const customers = await db.customer.findMany({ take: 20, orderBy: { createdAt: "asc" } });

  if (staff.length === 0) {
    console.log("No active staff found — nothing to assign orders to.");
    return;
  }

  function staffAt(i: number) {
    return staff[i % staff.length];
  }
  function branchFor(staffMember: (typeof staff)[number]) {
    return staffMember.branchId ?? branches[0]?.id ?? null;
  }
  function brandAt(i: number) {
    return brands.length > 0 ? brands[i % brands.length].id : null;
  }
  function customerAt(i: number) {
    return customers.length > 0 ? customers[i % customers.length] : null;
  }

  type Spec = {
    orderType: string;
    productOrService: string;
    description: string;
    department: string;
    quantity: number;
    orderValue: number;
    deadlineHours: number; // negative = overdue
    status:
      | "NEW_ORDER" | "ORDER_CONFIRMED" | "ASSIGNED" | "IN_PROGRESS" | "WAITING_FOR_MATERIALS"
      | "IN_PRODUCTION" | "QUALITY_CHECK" | "REVISION_REQUIRED" | "APPROVED" | "READY_FOR_DELIVERY"
      | "DISPATCHED" | "DELIVERED" | "COMPLETED" | "ON_HOLD" | "CANCELLED";
    progressPercent: number;
    delay?: { reasonType: "WAITING_FOR_MATERIALS" | "SUPPLIER_DELAY" | "PRODUCTION_DELAY" | "DESIGN_APPROVAL_PENDING" | "CUSTOMER_CHANGES" | "QUALITY_CONTROL_ISSUE" | "STAFF_AVAILABILITY" | "OTHER"; explanation: string };
    pendingApproval?: boolean;
    decidedApproval?: { decision: "APPROVED" | "REVISION_REQUESTED" | "REJECTED"; comments: string };
    completedDaysAgo?: number; // for COMPLETED orders: how long ago it finished, relative to its deadline
    completedLate?: boolean;
  };

  const specs: Spec[] = [
    {
      orderType: "Custom jewellery", productOrService: "18k gold engagement ring — solitaire",
      description: "Solitaire setting, 1.2ct center stone, size 54.", department: "Design",
      quantity: 1, orderValue: 185000, deadlineHours: -72, status: "IN_PROGRESS", progressPercent: 55,
      delay: { reasonType: "WAITING_FOR_MATERIALS", explanation: "Supplier shipment of the center stone was delayed by a week." },
    },
    {
      orderType: "Custom jewellery", productOrService: "Gold bangle set — 4 pieces",
      description: "Matching set of 4 bangles, 22k gold, plain polish finish.", department: "Manufacturing",
      quantity: 4, orderValue: 96000, deadlineHours: -24, status: "WAITING_FOR_MATERIALS", progressPercent: 20,
      delay: { reasonType: "SUPPLIER_DELAY", explanation: "Gold stock delivery from supplier pushed back two days." },
    },
    {
      orderType: "Repair", productOrService: "Ruby pendant resizing",
      description: "Resize chain and re-check clasp.", department: "Quality Control",
      quantity: 1, orderValue: 8500, deadlineHours: 4, status: "QUALITY_CHECK", progressPercent: 85,
    },
    {
      orderType: "Custom jewellery", productOrService: "Sapphire cocktail ring",
      description: "Halo setting around a 2ct blue sapphire.", department: "Manufacturing",
      quantity: 1, orderValue: 142000, deadlineHours: 14, status: "IN_PRODUCTION", progressPercent: 60,
    },
    {
      orderType: "Custom jewellery", productOrService: "Diamond stud earrings — custom setting",
      description: "Customer-supplied diamonds, new 18k white gold setting.", department: "Stone Setting",
      quantity: 1, orderValue: 54000, deadlineHours: 40, status: "ASSIGNED", progressPercent: 10,
    },
    {
      orderType: "Custom jewellery", productOrService: "Men's signet ring — engraved",
      description: "Family crest engraving, 18k yellow gold.", department: "Design",
      quantity: 1, orderValue: 72000, deadlineHours: 72, status: "NEW_ORDER", progressPercent: 0,
    },
    {
      orderType: "Custom jewellery", productOrService: "Pearl necklace restringing",
      description: "Double-knotted restring with new silk thread.", department: "Packaging",
      quantity: 1, orderValue: 12000, deadlineHours: 240, status: "IN_PROGRESS", progressPercent: 40,
    },
    {
      orderType: "Wholesale", productOrService: "Birthstone charm bracelet — bulk order",
      description: "Bulk order of 15 bracelets for a corporate gift.", department: "Dispatch",
      quantity: 15, orderValue: 165000, deadlineHours: 480, status: "ORDER_CONFIRMED", progressPercent: 5,
    },
    {
      orderType: "Custom jewellery", productOrService: "Wedding band set — his & hers",
      description: "Matching bands, brushed finish, engraved dates inside.", department: "Quality Control",
      quantity: 2, orderValue: 88000, deadlineHours: 48, status: "QUALITY_CHECK", progressPercent: 90,
      pendingApproval: true,
    },
    {
      orderType: "Custom jewellery", productOrService: "Vintage ring restoration",
      description: "Restore an heirloom ring — re-plate and re-set loose stones.", department: "Manufacturing",
      quantity: 1, orderValue: 34000, deadlineHours: 120, status: "REVISION_REQUIRED", progressPercent: 70,
      pendingApproval: true,
    },
    {
      orderType: "Custom jewellery", productOrService: "Gemstone brooch repair",
      description: "Replace missing prongs and re-polish setting.", department: "Quality Control",
      quantity: 1, orderValue: 15000, deadlineHours: 96, status: "ON_HOLD", progressPercent: 30,
    },
    {
      orderType: "Repair", productOrService: "Anniversary eternity band — resize",
      description: "Customer cancelled — opted for a different design instead.", department: "Design",
      quantity: 1, orderValue: 0, deadlineHours: 72, status: "CANCELLED", progressPercent: 0,
    },
    {
      orderType: "Custom jewellery", productOrService: "Sapphire tennis bracelet",
      description: "18k white gold, 3ct total sapphire weight.", department: "Dispatch",
      quantity: 1, orderValue: 210000, deadlineHours: -120, status: "COMPLETED", progressPercent: 100,
      completedDaysAgo: 2, completedLate: false,
      decidedApproval: { decision: "APPROVED", comments: "Finish and stone setting both look excellent." },
    },
    {
      orderType: "Custom jewellery", productOrService: "Tiara customization for a wedding",
      description: "Resize and add extra crystal detailing to a rental tiara.", department: "Design",
      quantity: 1, orderValue: 45000, deadlineHours: -240, status: "COMPLETED", progressPercent: 100,
      completedDaysAgo: 3, completedLate: true,
    },
  ];

  let created = 0;
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    const primaryStaff = staffAt(i);
    const branchId = branchFor(primaryStaff);
    const brandId = brandAt(i);
    const customer = customerAt(i);
    const deadline = hoursFromNow(s.deadlineHours);

    const completedAt =
      s.status === "COMPLETED"
        ? s.completedLate
          ? new Date(deadline.getTime() + (s.completedDaysAgo ?? 1) * 86_400_000)
          : new Date(deadline.getTime() - (s.completedDaysAgo ?? 1) * 86_400_000)
        : null;

    const order = await db.order.create({
      data: {
        orderNumber: orderNumber(),
        brandId,
        customerId: customer?.id ?? null,
        customerContact: customer ? null : "Walk-in customer",
        orderType: s.orderType,
        productOrService: s.productOrService,
        description: s.description,
        department: s.department,
        quantity: s.quantity,
        orderValue: s.orderValue,
        orderDate: daysFromNow(-7),
        originalDeadline: deadline,
        currentDeadline: deadline,
        status: s.status,
        progressPercent: s.progressPercent,
        internalInstructions: "[DEMO] Sample order seeded for dashboard demoing — not a real customer order.",
        branchId,
        primaryStaffId: primaryStaff.id,
        createdById: owner.id,
        completedAt,
        cancelledAt: s.status === "CANCELLED" ? new Date() : null,
        statusHistory: {
          create: { toStatus: s.status, changedById: owner.id, reason: "Dev sample order created" },
        },
      },
    });

    if (s.delay) {
      await db.orderDelay.create({
        data: { orderId: order.id, reasonType: s.delay.reasonType, explanation: s.delay.explanation, reportedById: primaryStaff.id },
      });
    }
    if (s.pendingApproval) {
      await db.orderApproval.create({ data: { orderId: order.id, requestedById: primaryStaff.id } });
    }
    if (s.decidedApproval) {
      await db.orderApproval.create({
        data: {
          orderId: order.id,
          requestedById: primaryStaff.id,
          decision: s.decidedApproval.decision,
          comments: s.decidedApproval.comments,
          reviewedById: owner.id,
          reviewedAt: completedAt ?? new Date(),
        },
      });
    }

    console.log("created:", order.orderNumber, order.productOrService, `(${s.status})`);
    created++;
  }

  console.log(`Done — created ${created} demo orders.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
