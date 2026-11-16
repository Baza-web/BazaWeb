import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageStaff, canManageStaffScoped, canViewSalary, isCompanyWide, ROLE_LABELS } from "@/lib/rbac";
import { formatDate, formatMoney, round2 } from "@/lib/utils";
import { StaffProfileForm } from "@/components/StaffProfileForm";
import { StaffPayForm } from "@/components/StaffPayForm";
import { StaffPasswordForm } from "@/components/StaffPasswordForm";
import { StaffDocumentsForm } from "@/components/StaffDocumentsForm";
import { setLeaveEntitlement } from "../../leave/actions";
import { toggleOnboardingTask, setStaffBrands } from "../actions";

const EMPLOYMENT_LABELS: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
};

const LEAVE_TYPES = ["SICK", "VACATION", "PERSONAL", "OTHER"] as const;

function daysInclusive(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export default async function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaffScoped(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { id } = await params;
  const staff = await db.staff.findFirst({
    where: { id, deletedAt: null, ...(isCompanyWide(session.role) ? {} : { branchId: session.branchId }) },
    include: { branch: true, brands: true },
  });
  if (!staff) notFound();

  const showSalary = canViewSalary(session.role);
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999);

  const [entitlements, approvedLeaveThisYear, onboardingTasks, allBrands, pendingEdit] = await Promise.all([
    db.leaveEntitlement.findMany({ where: { staffId: staff.id, year: currentYear } }),
    db.leaveRequest.findMany({
      where: { staffId: staff.id, status: "APPROVED", startDate: { gte: yearStart, lte: yearEnd } },
    }),
    db.onboardingTask.findMany({ where: { staffId: staff.id }, orderBy: { createdAt: "asc" } }),
    db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.editRequest.findFirst({ where: { entityType: "STAFF", entityId: staff.id, status: "PENDING" } }),
  ]);
  const staffBrandIds = new Set(staff.brands.map((b) => b.id));

  const usedByType = new Map<string, number>();
  for (const req of approvedLeaveThisYear) {
    usedByType.set(req.type, (usedByType.get(req.type) ?? 0) + daysInclusive(req.startDate, req.endDate));
  }
  const leaveRows = LEAVE_TYPES.map((type) => {
    const entitlement = entitlements.find((e) => e.type === type);
    const allotted = entitlement?.daysAllotted ?? 0;
    const used = usedByType.get(type) ?? 0;
    return { type, allotted, used, remaining: round2(allotted - used) };
  });

  const onboardingDone = onboardingTasks.filter((t) => t.completed).length;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-stone-500">{ROLE_LABELS[staff.role]} · {staff.branch?.name ?? "No branch"}</p>
        <h1 className="page-title">{staff.name}</h1>
        <p className="text-sm text-stone-500">{staff.email}</p>
      </div>

      {pendingEdit && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">An edit is awaiting Owner approval</p>
          <p className="mt-1 text-amber-700">
            {pendingEdit.fieldSummary} — requested {new Date(pendingEdit.createdAt).toLocaleDateString()}. No
            further edits can be made to this profile until that request is approved or rejected.
          </p>
        </div>
      )}

      <div className="card grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-stone-500">Status</p>
          <p className="font-medium">
            <span className={`badge ${staff.active ? "bg-green-100 text-green-700" : "bg-stone-200 text-stone-600"}`}>
              {staff.active ? "Active" : "Inactive"}
            </span>
          </p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Phone</p>
          <p className="font-medium">{staff.phone ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">NIC / ID number</p>
          <p className="font-medium">{staff.nic ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Date of birth</p>
          <p className="font-medium">{staff.dateOfBirth ? formatDate(staff.dateOfBirth) : "—"}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Date of joining</p>
          <p className="font-medium">{staff.dateOfJoining ? formatDate(staff.dateOfJoining) : "—"}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Employment type</p>
          <p className="font-medium">{staff.employmentType ? EMPLOYMENT_LABELS[staff.employmentType] : "—"}</p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs text-stone-500">Address</p>
          <p className="font-medium">{staff.address ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Emergency contact</p>
          <p className="font-medium">{staff.emergencyContactName ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-stone-500">Emergency contact phone</p>
          <p className="font-medium">{staff.emergencyContactPhone ?? "—"}</p>
        </div>
      </div>

      {showSalary && (
        <div className="card grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-stone-500">Base salary (monthly)</p>
            <p className="font-medium">{staff.baseSalary != null ? formatMoney(staff.baseSalary) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">Bank</p>
            <p className="font-medium">{staff.bankName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">Account number</p>
            <p className="font-medium">{staff.bankAccountNumber ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">Branch</p>
            <p className="font-medium">{staff.bankBranch ?? "—"}</p>
          </div>
        </div>
      )}

      {allBrands.length > 0 && (
        <div className="card">
          <h2 className="mb-1 font-medium">Brands</h2>
          <p className="mb-3 text-xs text-stone-400">
            Which brand(s) this person works for — some staff work for two. Shown to Accounting and Admins
            alongside salary.
          </p>
          <form action={setStaffBrands.bind(null, staff.id)} className="space-y-3">
            <div className="flex flex-wrap gap-3">
              {allBrands.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm text-stone-600">
                  <input
                    type="checkbox"
                    name="brandIds"
                    value={b.id}
                    defaultChecked={staffBrandIds.has(b.id)}
                    className="h-4 w-4 rounded border-stone-300"
                  />
                  {b.name}
                </label>
              ))}
            </div>
            <button type="submit" className="btn-secondary text-sm">
              Save brands
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 font-medium">Edit HR details</h2>
        <StaffProfileForm staff={staff} disabled={!!pendingEdit} requiresApproval={session.role !== "OWNER"} />
      </div>

      {showSalary && (
        <div className="card">
          <h2 className="mb-3 font-medium">Salary & bank details</h2>
          <StaffPayForm staff={staff} disabled={!!pendingEdit} requiresApproval={session.role !== "OWNER"} />
        </div>
      )}

      {canManageStaff(session.role) && (
        <div className="card">
          <h2 className="mb-3 font-medium">Login password</h2>
          <p className="mb-3 text-xs text-stone-400">
            Sets a new password for this account — share it with {staff.name} directly, it won&apos;t be emailed.
          </p>
          <StaffPasswordForm staffId={staff.id} disabled={!!pendingEdit} requiresApproval={session.role !== "OWNER"} />
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 font-medium">Documents</h2>
        {staff.documents.length > 0 ? (
          <ul className="mb-3 space-y-1 text-sm">
            {staff.documents.map((doc, i) => (
              <li key={doc}>
                <a href={doc} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
                  Document {i + 1}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-stone-400">No documents uploaded yet.</p>
        )}
        <StaffDocumentsForm staffId={staff.id} />
      </div>

      <div className="card overflow-x-auto">
        <h2 className="mb-3 font-medium">Leave balances — {currentYear}</h2>
        <table className="table-base">
          <thead>
            <tr>
              <th>Type</th>
              <th>Allotted</th>
              <th>Used</th>
              <th>Remaining</th>
              <th>Set allotted days</th>
            </tr>
          </thead>
          <tbody>
            {leaveRows.map((row) => (
              <tr key={row.type}>
                <td>{row.type}</td>
                <td>{row.allotted}</td>
                <td>{row.used}</td>
                <td className={row.remaining < 0 ? "text-red-700" : undefined}>{row.remaining}</td>
                <td>
                  <form action={setLeaveEntitlement.bind(null, staff.id)} className="flex items-center gap-1">
                    <input type="hidden" name="type" value={row.type} />
                    <input type="hidden" name="year" value={currentYear} />
                    <input
                      name="daysAllotted"
                      type="number"
                      min="0"
                      step="0.5"
                      defaultValue={row.allotted}
                      className="input w-20 text-xs"
                    />
                    <button type="submit" className="btn-secondary text-xs">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Onboarding checklist</h2>
          <span className="text-xs text-stone-400">
            {onboardingDone} / {onboardingTasks.length} done
          </span>
        </div>
        <ul className="space-y-2">
          {onboardingTasks.map((task) => (
            <li key={task.id}>
              <form action={toggleOnboardingTask.bind(null, task.id)}>
                <button
                  type="submit"
                  aria-pressed={task.completed}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-stone-50 ${
                    task.completed ? "text-stone-400 line-through" : "text-ink-800"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      task.completed ? "border-brand-500 bg-brand-500 text-white" : "border-stone-300"
                    }`}
                  >
                    {task.completed && "✓"}
                  </span>
                  {task.label}
                </button>
              </form>
            </li>
          ))}
          {onboardingTasks.length === 0 && (
            <p className="text-sm text-stone-400">No onboarding checklist for this account.</p>
          )}
        </ul>
      </div>
    </div>
  );
}
