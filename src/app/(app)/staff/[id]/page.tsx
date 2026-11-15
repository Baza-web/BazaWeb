import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageStaffScoped, canViewSalary, isCompanyWide, ROLE_LABELS } from "@/lib/rbac";
import { formatDate, formatMoney } from "@/lib/utils";
import { StaffProfileForm } from "@/components/StaffProfileForm";
import { StaffPayForm } from "@/components/StaffPayForm";
import { StaffDocumentsForm } from "@/components/StaffDocumentsForm";

const EMPLOYMENT_LABELS: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
};

export default async function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  if (!canManageStaffScoped(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { id } = await params;
  const staff = await db.staff.findFirst({
    where: { id, deletedAt: null, ...(isCompanyWide(session.role) ? {} : { branchId: session.branchId }) },
    include: { branch: true },
  });
  if (!staff) notFound();

  const showSalary = canViewSalary(session.role);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-stone-500">{ROLE_LABELS[staff.role]} · {staff.branch?.name ?? "No branch"}</p>
        <h1 className="page-title">{staff.name}</h1>
        <p className="text-sm text-stone-500">{staff.email}</p>
      </div>

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

      <div className="card">
        <h2 className="mb-3 font-medium">Edit HR details</h2>
        <StaffProfileForm staff={staff} />
      </div>

      {showSalary && (
        <div className="card">
          <h2 className="mb-3 font-medium">Salary & bank details</h2>
          <StaffPayForm staff={staff} />
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
    </div>
  );
}
