"use client";

import { useMemo, useState, useTransition } from "react";
import { createOrder, reviewWhatsAppOrderAsCustomOrder, type CustomOrderPrefill } from "@/app/(app)/orders/actions";

type CustomerOption = { id: string; name: string; branchId: string };
type StaffOption = { id: string; name: string };
type BranchOption = { id: string; name: string };
type BrandOption = { id: string; name: string };

export function OrderForm({
  brands,
  customers,
  staffList,
  branches,
  departments,
  showBranchSelect,
  defaultBranchId,
  defaultDeadline,
  whatsappOrderId,
}: {
  brands: BrandOption[];
  customers: CustomerOption[];
  staffList: StaffOption[];
  branches: BranchOption[];
  departments: string[];
  showBranchSelect: boolean;
  defaultBranchId: string;
  defaultDeadline: string;
  whatsappOrderId?: string;
}) {
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [customerId, setCustomerId] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [orderType, setOrderType] = useState(whatsappOrderId ? "Custom jewellery (WhatsApp order)" : "");
  const [productOrService, setProductOrService] = useState("");
  const [description, setDescription] = useState("");
  const [orderValue, setOrderValue] = useState("");
  const [promisedDeadline, setPromisedDeadline] = useState(defaultDeadline);
  const [internalInstructions, setInternalInstructions] = useState("");
  const [primaryStaffId, setPrimaryStaffId] = useState("");

  const [loading, startLoad] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);

  const branchCustomers = useMemo(() => customers.filter((c) => c.branchId === branchId), [customers, branchId]);

  function applyPrefill(result: CustomOrderPrefill) {
    if (result.error) {
      setLoadError(result.error);
      return;
    }
    if (result.customerId) setCustomerId(result.customerId);
    if (result.customerContact) setCustomerContact(result.customerContact);
    if (result.productOrService) setProductOrService(result.productOrService);
    if (result.description) setDescription(result.description);
    if (result.orderValue != null) setOrderValue(String(result.orderValue));
    if (result.originalDeadline) setPromisedDeadline(`${result.originalDeadline}T09:00`);
    if (result.internalInstructions) setInternalInstructions(result.internalInstructions);
    if (result.primaryStaffId) setPrimaryStaffId(result.primaryStaffId);

    const notices: string[] = [];
    if (result.customerContact && !result.customerId) {
      notices.push("No matching customer found in your records — add them as a customer first, or leave as a contact note.");
    }
    if (!result.primaryStaffId) {
      notices.push("Couldn't match a staff member to assign — pick one manually below.");
    }
    notices.push("Filled in below from the WhatsApp message — check it over before creating the order.");
    setLoadNotice(notices.join(" "));
  }

  function loadWhatsAppOrder() {
    if (!whatsappOrderId) return;
    setLoadError(null);
    setLoadNotice(null);
    startLoad(async () => {
      let result: CustomOrderPrefill;
      try {
        result = await reviewWhatsAppOrderAsCustomOrder(whatsappOrderId, branchId);
      } catch {
        setLoadError("Couldn't load that WhatsApp order — someone else may have already reviewed it.");
        return;
      }
      applyPrefill(result);
    });
  }

  return (
    <form action={createOrder} className="card space-y-5" encType="multipart/form-data">
      {whatsappOrderId && <input type="hidden" name="whatsappOrderId" value={whatsappOrderId} />}

      {whatsappOrderId && (
        <div className="rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-3">
          <p className="mb-2 text-sm font-medium text-ink-900">This order came from WhatsApp</p>
          <p className="mb-2 text-xs text-stone-500">
            Pick the right branch below if needed, then load it — AI will try to match the customer against that
            branch&apos;s records and fill in the custom-order details below for you to check.
          </p>
          <button type="button" onClick={loadWhatsAppOrder} disabled={loading} className="btn-primary text-xs">
            {loading ? "Reading…" : "Load this WhatsApp order"}
          </button>
          {loadError && <p className="mt-2 text-xs text-red-600">{loadError}</p>}
          {loadNotice && !loadError && <p className="mt-2 text-xs text-amber-700">{loadNotice}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Brand</label>
          <select className="input" name="brandId" defaultValue="">
            <option value="">No specific brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Order type</label>
          <input
            className="input"
            name="orderType"
            required
            placeholder="Custom jewellery, repair, wholesale…"
            value={orderType}
            onChange={(e) => setOrderType(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Customer (existing)</label>
          <select className="input" name="customerId" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Walk-in / not in CRM yet</option>
            {branchCustomers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Customer contact (if not linked above)</label>
          <input
            className="input"
            name="customerContact"
            placeholder="Name and phone/email"
            value={customerContact}
            onChange={(e) => setCustomerContact(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="label">Product or service</label>
        <input
          className="input"
          name="productOrService"
          required
          placeholder="18k gold engagement ring, repair of…"
          value={productOrService}
          onChange={(e) => setProductOrService(e.target.value)}
        />
      </div>

      <div>
        <label className="label">Order description</label>
        <textarea className="input" name="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Product specifications</label>
          <textarea className="input" name="specifications" rows={2} placeholder="Metal, carat, size, stones…" />
        </div>
        <div>
          <label className="label">Customization requirements</label>
          <textarea className="input" name="customizationRequirements" rows={2} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Quantity</label>
          <input className="input" type="number" min="1" name="quantity" defaultValue={1} />
        </div>
        <div>
          <label className="label">Order value (LKR, if applicable)</label>
          <input
            className="input"
            type="number"
            min="0"
            step="0.01"
            name="orderValue"
            value={orderValue}
            onChange={(e) => setOrderValue(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Department</label>
          <input className="input" name="department" list="department-options" placeholder="Design, Manufacturing, QC…" />
          <datalist id="department-options">
            {departments.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="label">Promised deadline</label>
          <input
            className="input"
            type="datetime-local"
            name="promisedDeadline"
            required
            value={promisedDeadline}
            onChange={(e) => setPromisedDeadline(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Manual priority (optional)</label>
          <select className="input" name="manualPriority" defaultValue="">
            <option value="">Use automatic priority</option>
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>
        <div>
          <label className="label">Initial status</label>
          <select className="input" name="status" defaultValue="NEW_ORDER">
            <option value="NEW_ORDER">New Order</option>
            <option value="ORDER_CONFIRMED">Order Confirmed</option>
            <option value="ASSIGNED">Assigned</option>
          </select>
        </div>
      </div>

      {showBranchSelect ? (
        <div>
          <label className="label">Branch</label>
          <select className="input" name="branchId" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Company-wide</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="branchId" value={defaultBranchId} />
      )}

      <div>
        <label className="label">Primary responsible employee</label>
        <select
          className="input"
          name="primaryStaffId"
          required
          value={primaryStaffId}
          onChange={(e) => setPrimaryStaffId(e.target.value)}
        >
          <option value="" disabled>Select employee…</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Supporting employees (optional)</label>
        <div className="mt-1 grid max-h-48 grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-stone-200 p-2 sm:grid-cols-2">
          {staffList.map((s) => (
            <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-stone-50">
              <input type="checkbox" name="supportingStaffIds" value={s.id} className="h-4 w-4 rounded border-stone-300" />
              {s.name}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Internal instructions (staff only)</label>
          <textarea
            className="input"
            name="internalInstructions"
            rows={2}
            value={internalInstructions}
            onChange={(e) => setInternalInstructions(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Customer instructions</label>
          <textarea className="input" name="customerInstructions" rows={2} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Reference images</label>
          <input className="input" type="file" name="referenceImages" accept="image/*" multiple />
        </div>
        <div>
          <label className="label">Supporting documents</label>
          <input className="input" type="file" name="supportingDocuments" accept="image/*,.pdf" multiple />
        </div>
      </div>

      <button type="submit" className="btn-primary">Create order</button>
    </form>
  );
}
