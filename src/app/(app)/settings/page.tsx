import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageIntegrations } from "@/lib/rbac";
import { getDriveConnection, driveConnectConfigured, BACKUP_FOLDER_NAME } from "@/lib/googleDrive";
import { formatDateTime } from "@/lib/utils";
import { disconnectGoogleDrive } from "./actions";
import { GoogleDriveLogo, WarningCircle, CheckCircle } from "@/components/icons";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  if (!canManageIntegrations(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { error, success } = await searchParams;
  const [connection, configured] = await Promise.all([getDriveConnection(), Promise.resolve(driveConnectConfigured())]);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="page-title">Settings</h1>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>{success}</p>
        </div>
      )}

      <div className="card">
        <h2 className="section-title mb-1 flex items-center gap-2">
          <GoogleDriveLogo size={20} className="text-brand-500" aria-hidden="true" />
          Google Drive backup
        </h2>
        <p className="mb-4 text-sm text-stone-500">
          Connect a Google account once, and daily backups will upload automatically into a{" "}
          <span className="font-medium text-ink-800">&quot;{BACKUP_FOLDER_NAME}&quot;</span> folder in that
          account&apos;s own Drive — using its normal storage, with no further sign-in needed.
        </p>

        {!configured ? (
          <p className="rounded-lg bg-stone-50 px-4 py-3 text-sm text-stone-500">
            This server isn&apos;t set up for Google Drive yet — see <code>DEPLOY.md</code> for the one-time setup
            (a Google Cloud OAuth client with the Drive scope and redirect URI added).
          </p>
        ) : connection ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-sm font-medium text-green-800">Connected</p>
              <p className="text-sm text-green-700">
                As <span className="font-medium">{connection.googleEmail}</span> — connected{" "}
                {formatDateTime(connection.connectedAt)} by {connection.connectedBy.name}.
              </p>
            </div>
            <form action={disconnectGoogleDrive}>
              <button type="submit" className="btn-danger text-sm">
                Disconnect
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-stone-500">Not connected yet — no backups are running.</p>
            <a href="/api/auth/google/drive/connect" className="btn-primary inline-flex">
              <GoogleDriveLogo size={16} aria-hidden="true" />
              Connect Google Drive
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
