import { requireSessionOrRedirect } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { initials } from "@/lib/utils";
import { changePassword } from "./actions";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  const { error, success } = await searchParams;

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="page-title">Your account</h1>

      <div className="card flex items-center gap-4">
        <span className="avatar h-12 w-12 text-base">{initials(session.name)}</span>
        <div>
          <p className="font-medium text-ink-900">{session.name}</p>
          <p className="text-sm text-stone-500">{session.email}</p>
          <p className="text-xs text-stone-400">{ROLE_LABELS[session.role]}</p>
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="section-title">Change password</h2>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {success && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            Password updated successfully.
          </p>
        )}

        <form action={changePassword} className="space-y-4">
          <div>
            <label className="label">Current password</label>
            <input className="input" name="currentPassword" type="password" required />
          </div>
          <div>
            <label className="label">New password</label>
            <input className="input" name="newPassword" type="password" minLength={8} required />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input className="input" name="confirmPassword" type="password" minLength={8} required />
          </div>
          <button type="submit" className="btn-primary">
            Update password
          </button>
        </form>
      </div>
    </div>
  );
}
