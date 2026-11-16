"use client";

import { setStaffPassword } from "@/app/(app)/staff/actions";

export function StaffPasswordForm({
  staffId,
  disabled,
  requiresApproval,
}: {
  staffId: string;
  disabled?: boolean;
  requiresApproval?: boolean;
}) {
  return (
    <form action={setStaffPassword.bind(null, staffId)} className="space-y-3">
      <fieldset disabled={disabled} className="space-y-3">
        <div>
          <label className="label">New password</label>
          <input className="input" name="password" type="text" minLength={8} required autoComplete="new-password" />
        </div>
        <button type="submit" className="btn-primary">
          Reset password
        </button>
        {requiresApproval && (
          <p className="text-xs text-stone-400">Saving will send this for an Owner to approve — nothing changes until then.</p>
        )}
      </fieldset>
    </form>
  );
}
