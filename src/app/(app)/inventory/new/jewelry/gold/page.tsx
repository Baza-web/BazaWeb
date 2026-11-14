import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageInventory, isCompanyWide } from "@/lib/rbac";
import { JewelryIntakeForm } from "@/components/JewelryIntakeForm";
import { Crown } from "@/components/icons";

export default async function NewGoldJewelryPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageInventory(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const branches = isCompanyWide(session.role) ? await db.branch.findMany({ orderBy: { name: "asc" } }) : [];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="flex items-center gap-2 text-sm text-amber-600">
          <Crown size={16} weight="fill" aria-hidden="true" />
          Gold Jewelry
        </p>
        <h1 className="page-title">Add a gold jewelry item</h1>
      </div>

      <JewelryIntakeForm metal="Gold" showBranchSelect={isCompanyWide(session.role)} branches={branches} />
    </div>
  );
}
