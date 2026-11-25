import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canAccessTravel } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";
import { Airplane, MapTrifold, CheckCircle, Clock, ArrowRight } from "@/components/icons";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-stone-100 text-stone-600",
  PENDING_APPROVAL: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  READY_FOR_MARKETPLACE: "bg-blue-100 text-blue-700",
  PUBLISHED: "bg-brand-100 text-brand-700",
  ACTIVE: "bg-brand-100 text-brand-700",
  PAUSED: "bg-amber-100 text-amber-700",
  ARCHIVED: "bg-stone-100 text-stone-400",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  READY_FOR_MARKETPLACE: "Ready for marketplace",
  PUBLISHED: "Published",
  ACTIVE: "Active",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
};

export default async function TravelDashboardPage() {
  const session = await requireSessionOrRedirect();
  if (!canAccessTravel(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const scope = branchScope(session);

  const [totalTours, pendingApproval, approved, drafts, recentTours] = await Promise.all([
    db.tour.count({ where: { ...scope, status: { not: "ARCHIVED" } } }),
    db.tour.count({ where: { ...scope, status: "PENDING_APPROVAL" } }),
    db.tour.count({ where: { ...scope, status: { in: ["APPROVED", "READY_FOR_MARKETPLACE", "PUBLISHED", "ACTIVE"] } } }),
    db.tour.count({ where: { ...scope, status: "DRAFT" } }),
    db.tour.findMany({
      where: { ...scope, status: { not: "ARCHIVED" } },
      include: { createdBy: true, branch: true },
      orderBy: { updatedAt: "desc" },
      take: 6,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Airplane size={26} className="text-brand-500" aria-hidden="true" />
            Travel &amp; Experiences
          </h1>
          <p className="text-sm text-stone-500">
            Internal tour management for Baza Travels &amp; GetYourGuide experiences — Phase 1.
          </p>
        </div>
        <Link href="/travel/tours" className="btn-secondary">
          Manage tours <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
        This is an internal product catalog only. No tour here is published on GetYourGuide or any
        marketplace yet — marketplace integration arrives in a later phase. Dev sample tours are
        clearly marked in their internal notes.
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Active tours</p>
            <MapTrifold size={18} className="text-brand-500" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold text-ink-900">{totalTours}</p>
        </div>
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Drafts</p>
            <Clock size={18} className="text-stone-400" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold text-ink-900">{drafts}</p>
        </div>
        <Link href="/travel/tours?status=PENDING_APPROVAL" className="stat-tile transition-shadow hover:shadow-card-hover">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Pending approval</p>
            <Clock size={18} className="text-amber-500" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold text-amber-700">{pendingApproval}</p>
        </Link>
        <div className="stat-tile">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Approved+</p>
            <CheckCircle size={18} className="text-green-600" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xl sm:text-2xl font-semibold text-green-700">{approved}</p>
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Recently updated tours</h2>
          <Link href="/travel/tours" className="text-sm font-medium text-brand-600 hover:underline">
            View all
          </Link>
        </div>
        {recentTours.length === 0 ? (
          <p className="text-sm text-stone-400">
            No tours yet.{" "}
            <Link href="/travel/tours" className="text-brand-600 hover:underline">
              Create your first tour
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {recentTours.map((tour) => (
              <li key={tour.id}>
                <Link
                  href={`/travel/tours/${tour.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-stone-50"
                >
                  <div>
                    <p className="font-medium text-ink-900">{tour.title}</p>
                    <p className="text-xs text-stone-500">
                      {tour.internalCode} · {tour.category}
                      {tour.branch ? ` · ${tour.branch.name}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`badge ${STATUS_STYLES[tour.status]}`}>{STATUS_LABELS[tour.status]}</span>
                    <span className="text-xs text-stone-400">{formatDate(tour.updatedAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
