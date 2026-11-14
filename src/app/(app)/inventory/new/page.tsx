import Link from "next/link";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canManageInventory } from "@/lib/rbac";
import { Diamond, Crown, Sparkle } from "@/components/icons";

const OPTIONS = [
  {
    href: "/inventory/new/gemstone",
    title: "Loose Gemstone",
    description: "A diamond, ruby, sapphire or other stone sold on its own — carat, clarity, cut, certification.",
    icon: Diamond,
    accent: "bg-purple-50 text-purple-600",
  },
  {
    href: "/inventory/new/jewelry/gold",
    title: "Gold Jewelry",
    description: "A ring, necklace, bangle or other gold piece — karat, weight, and its own SKU.",
    icon: Crown,
    accent: "bg-amber-50 text-amber-600",
  },
  {
    href: "/inventory/new/jewelry/silver",
    title: "Silver Jewelry",
    description: "A ring, necklace, bangle or other silver piece — purity, weight, and its own SKU.",
    icon: Sparkle,
    accent: "bg-slate-100 text-slate-600",
  },
];

export default async function NewInventoryChooserPage() {
  const session = await requireSessionOrRedirect();
  if (!canManageInventory(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="page-title">Add inventory item</h1>
      <p className="text-sm text-stone-500">
        Choose what you&apos;re adding — each has its own short form with just the details that
        matter for it.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <Link
              key={opt.href}
              href={opt.href}
              className="card flex flex-col gap-3 transition-shadow hover:shadow-card-hover"
            >
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${opt.accent}`}>
                <Icon size={20} weight="fill" aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium text-ink-900">{opt.title}</p>
                <p className="mt-1 text-xs text-stone-500">{opt.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
