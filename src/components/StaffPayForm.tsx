"use client";

import { updateStaffPay } from "@/app/(app)/staff/actions";

type StaffPay = {
  id: string;
  baseSalary: number | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankBranch: string | null;
};

export function StaffPayForm({
  staff,
  disabled,
  requiresApproval,
}: {
  staff: StaffPay;
  disabled?: boolean;
  requiresApproval?: boolean;
}) {
  return (
    <form action={updateStaffPay.bind(null, staff.id)} className="space-y-3">
      <fieldset disabled={disabled} className="space-y-3">
      <div>
        <label className="label">Base salary (monthly)</label>
        <input className="input" type="number" step="0.01" min="0" name="baseSalary" defaultValue={staff.baseSalary ?? ""} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Bank name</label>
          <input className="input" name="bankName" defaultValue={staff.bankName ?? ""} />
        </div>
        <div>
          <label className="label">Account number</label>
          <input className="input" name="bankAccountNumber" defaultValue={staff.bankAccountNumber ?? ""} />
        </div>
        <div>
          <label className="label">Branch</label>
          <input className="input" name="bankBranch" defaultValue={staff.bankBranch ?? ""} />
        </div>
      </div>
      <button type="submit" className="btn-primary">
        Save salary & bank details
      </button>
      {requiresApproval && (
        <p className="text-xs text-stone-400">Saving will send this for an Owner to approve — nothing changes until then.</p>
      )}
      </fieldset>
    </form>
  );
}
