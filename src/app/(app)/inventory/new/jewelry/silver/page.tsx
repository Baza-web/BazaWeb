import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageInventory, isCompanyWide } from "@/lib/rbac";
import { JewelryIntakeForm } from "@/components/JewelryIntakeForm";
import { Sparkle } from "@/components/icons";

export default async function NewSilverJewelryPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageInventory(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const [branches, brands] = await Promise.all([
    isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
    db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Sparkle size={16} weight="fill" aria-hidden="true" />
          Silver Jewelry
        </p>
        <h1 className="page-title">Add a silver jewelry item</h1>
      </div>

      <JewelryIntakeForm metal="Silver" showBranchSelect={isCompanyWide(session.role)} branches={branches} brands={brands} />
    </div>
  );
}
