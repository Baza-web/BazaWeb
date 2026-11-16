import "server-only";
import { db } from "./db";
import { ROLE_LABELS } from "./rbac";
import type { ExportColumn } from "./xlsxExport";
import { buildExportSheet, buildExportWorkbook } from "./xlsxExport";

// Company-wide, unredacted versions of the /api/export/* queries — this is
// an internal disaster-recovery backup, not a user-facing export, so there's
// no branch scoping or role-based field hiding here on purpose.

export async function buildCustomersBackup() {
  const customers = await db.customer.findMany({
    include: { branch: true, _count: { select: { sales: true } } },
    orderBy: { createdAt: "desc" },
  });
  const columns: ExportColumn<(typeof customers)[number]>[] = [
    { header: "Name", value: (r) => r.name, width: 24 },
    { header: "Phone", value: (r) => r.phone, width: 16 },
    { header: "Email", value: (r) => r.email, width: 24 },
    { header: "Address", value: (r) => r.address, width: 30 },
    { header: "Birthday", value: (r) => r.birthday, format: "date", width: 14 },
    { header: "Anniversary", value: (r) => r.anniversary, format: "date", width: 14 },
    { header: "Branch", value: (r) => r.branch.name, width: 16 },
    { header: "Purchases", value: (r) => r._count.sales, width: 12 },
    { header: "Customer since", value: (r) => r.createdAt, format: "date", width: 14 },
  ];
  return buildExportSheet("Customers", columns, customers, (r) => r.id);
}

export async function buildSalesBackup() {
  const sales = await db.sale.findMany({
    include: { customer: true, branch: true, brand: true },
    orderBy: { createdAt: "desc" },
  });
  const columns: ExportColumn<(typeof sales)[number]>[] = [
    { header: "Invoice", value: (r) => r.invoiceNumber, width: 22 },
    { header: "Date", value: (r) => r.createdAt, format: "datetime", width: 16 },
    { header: "Customer", value: (r) => r.customer?.name ?? "Walk-in", width: 24 },
    { header: "Branch", value: (r) => r.branch.name, width: 16 },
    { header: "Brand", value: (r) => r.brand?.name, width: 16 },
    { header: "Subtotal", value: (r) => r.subtotal, format: "money", width: 14 },
    { header: "Discount", value: (r) => r.discount, format: "money", width: 14 },
    { header: "Tax", value: (r) => r.tax, format: "money", width: 12 },
    { header: "Total", value: (r) => r.total, format: "money", width: 14 },
    { header: "Amount paid", value: (r) => r.amountPaid, format: "money", width: 14 },
    { header: "Payment status", value: (r) => r.paymentStatus, width: 14 },
    { header: "Payment method", value: (r) => r.paymentMethod, width: 14 },
    { header: "Notes", value: (r) => r.notes, width: 30 },
  ];
  return buildExportSheet("Sales", columns, sales, (r) => r.id);
}

export async function buildInventoryBackup() {
  const items = await db.inventoryItem.findMany({
    include: { branch: true, brand: true },
    orderBy: { createdAt: "desc" },
  });
  const columns: ExportColumn<(typeof items)[number]>[] = [
    { header: "SKU", value: (r) => r.sku, width: 16 },
    { header: "Name", value: (r) => r.name, width: 26 },
    { header: "Category", value: (r) => r.category, width: 14 },
    { header: "Branch", value: (r) => r.branch.name, width: 16 },
    { header: "Brand", value: (r) => r.brand?.name, width: 16 },
    { header: "Metal type", value: (r) => r.metalType, width: 14 },
    { header: "Metal purity", value: (r) => r.metalPurity, width: 12 },
    { header: "Gross weight (g)", value: (r) => r.grossWeightG, width: 14 },
    { header: "Net weight (g)", value: (r) => r.netWeightG, width: 14 },
    { header: "Gemstone type", value: (r) => r.gemstoneType, width: 16 },
    { header: "Carat weight", value: (r) => r.caratWeight, width: 12 },
    { header: "Cost price", value: (r) => r.costPrice, format: "money", width: 14 },
    { header: "Selling price", value: (r) => r.sellingPrice, format: "money", width: 14 },
    { header: "Quantity", value: (r) => r.quantity, width: 10 },
    { header: "Low stock at", value: (r) => r.lowStockAt, width: 12 },
    { header: "Status", value: (r) => r.status, width: 14 },
  ];
  return buildExportSheet("Inventory", columns, items, (r) => r.id);
}

export async function buildPurchasingBackup() {
  const [suppliers, orders] = await Promise.all([
    db.supplier.findMany({ orderBy: { name: "asc" } }),
    db.purchaseOrder.findMany({
      include: { supplier: true, branch: true, items: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const supplierColumns: ExportColumn<(typeof suppliers)[number]>[] = [
    { header: "Name", value: (s) => s.name, width: 24 },
    { header: "Contact person", value: (s) => s.contactName, width: 20 },
    { header: "Phone", value: (s) => s.phone, width: 16 },
    { header: "Email", value: (s) => s.email, width: 24 },
    { header: "Address", value: (s) => s.address, width: 30 },
    { header: "Notes", value: (s) => s.notes, width: 30 },
  ];
  const orderColumns: ExportColumn<(typeof orders)[number]>[] = [
    { header: "Order #", value: (o) => o.orderNumber, width: 20 },
    { header: "Supplier", value: (o) => o.supplier.name, width: 22 },
    { header: "Branch", value: (o) => o.branch.name, width: 16 },
    { header: "Order date", value: (o) => o.orderDate, format: "date", width: 14 },
    { header: "Expected date", value: (o) => o.expectedDate, format: "date", width: 14 },
    { header: "Items", value: (o) => o.items.length, width: 10 },
    { header: "Total amount", value: (o) => o.totalAmount, format: "money", width: 14 },
    { header: "Amount paid", value: (o) => o.amountPaid, format: "money", width: 14 },
    { header: "Status", value: (o) => o.status, width: 14 },
    { header: "Notes", value: (o) => o.notes, width: 30 },
  ];
  return buildExportWorkbook([
    { title: "Suppliers", columns: supplierColumns as ExportColumn<unknown>[], rows: suppliers, idOf: (r) => (r as (typeof suppliers)[number]).id },
    { title: "Purchase Orders", columns: orderColumns as ExportColumn<unknown>[], rows: orders, idOf: (r) => (r as (typeof orders)[number]).id },
  ]);
}

export async function buildAccountingBackup() {
  const entries = await db.ledgerEntry.findMany({
    include: { branch: true, sale: true, expense: true },
    orderBy: { date: "desc" },
  });
  const columns: ExportColumn<(typeof entries)[number]>[] = [
    { header: "Date", value: (r) => r.date, format: "date", width: 14 },
    { header: "Branch", value: (r) => r.branch.name, width: 16 },
    { header: "Type", value: (r) => r.type, width: 12 },
    { header: "Description", value: (r) => r.description, width: 36 },
    { header: "Amount", value: (r) => r.amount, format: "money", width: 14 },
    { header: "Linked invoice", value: (r) => r.sale?.invoiceNumber, width: 20 },
  ];
  return buildExportSheet("Ledger", columns, entries, (r) => r.id);
}

export async function buildStaffBackup() {
  const staff = await db.staff.findMany({
    where: { deletedAt: null },
    include: { branch: true, brands: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  const columns: ExportColumn<(typeof staff)[number]>[] = [
    { header: "Name", value: (r) => r.name, width: 24 },
    { header: "Email", value: (r) => r.email, width: 28 },
    { header: "Phone", value: (r) => r.phone, width: 16 },
    { header: "Role", value: (r) => ROLE_LABELS[r.role], width: 16 },
    { header: "Branch", value: (r) => r.branch?.name, width: 16 },
    { header: "Brands", value: (r) => r.brands.map((b) => b.name).join(", "), width: 24 },
    { header: "Active", value: (r) => (r.active ? "Yes" : "No"), width: 10 },
    { header: "Date of joining", value: (r) => r.dateOfJoining, format: "date", width: 14 },
    { header: "NIC", value: (r) => r.nic, width: 16 },
    { header: "Base salary", value: (r) => r.baseSalary, format: "money", width: 14 },
    { header: "Bank", value: (r) => r.bankName, width: 18 },
    { header: "Account number", value: (r) => r.bankAccountNumber, width: 18 },
    { header: "Bank branch", value: (r) => r.bankBranch, width: 16 },
  ];
  return buildExportSheet("Staff", columns, staff, (r) => r.id);
}

export const BACKUP_SHEETS: { name: string; build: () => Promise<Buffer> }[] = [
  { name: "customers", build: buildCustomersBackup },
  { name: "sales", build: buildSalesBackup },
  { name: "inventory", build: buildInventoryBackup },
  { name: "purchasing", build: buildPurchasingBackup },
  { name: "accounting-ledger", build: buildAccountingBackup },
  { name: "staff", build: buildStaffBackup },
];
