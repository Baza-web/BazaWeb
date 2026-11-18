import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canAccessTravel, isCompanyWide } from "@/lib/rbac";
import { formatMoney } from "@/lib/utils";
import { createTour } from "../actions";
import { MapTrifold } from "@/components/icons";

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

const STATUS_FILTERS = ["ALL", "DRAFT", "PENDING_APPROVAL", "APPROVED", "ARCHIVED"] as const;

export default async function ToursPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireSessionOrRedirect();
  if (!canAccessTravel(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { status } = await searchParams;
  const scope = branchScope(session);

  const [tours, branches] = await Promise.all([
    db.tour.findMany({
      where: {
        ...scope,
        ...(status && status !== "ALL" ? { status: status as never } : { status: { not: "ARCHIVED" } }),
      },
      include: { branch: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    isCompanyWide(session.role) ? db.branch.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Tour Management</h1>
          <p className="text-sm text-stone-500">Create and manage Baza Travels &amp; GetYourGuide tour products.</p>
        </div>
        <Link href="/travel" className="text-sm font-medium text-brand-600 hover:underline">
          ← Travel dashboard
        </Link>
      </div>

      <div className="card">
        <h2 className="section-title mb-3 flex items-center gap-2">
          <MapTrifold size={18} className="text-brand-500" aria-hidden="true" />
          Create a new tour
        </h2>
        <form action={createTour} className="space-y-4" encType="multipart/form-data">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Title</label>
              <input className="input" name="title" required placeholder="Lotus Tower Lunch Experience" />
            </div>
            <div>
              <label className="label">Category</label>
              <input className="input" name="category" required placeholder="City tour, day trip, workshop…" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Destination</label>
              <input className="input" name="destination" />
            </div>
            <div>
              <label className="label">Country</label>
              <input className="input" name="country" defaultValue="Sri Lanka" />
            </div>
            <div>
              <label className="label">City</label>
              <input className="input" name="city" />
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <textarea className="input" name="description" rows={3} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Highlights</label>
              <textarea className="input" name="highlights" rows={2} placeholder="One per line or comma separated" />
            </div>
            <div>
              <label className="label">Important info</label>
              <textarea className="input" name="importantInfo" rows={2} />
            </div>
            <div>
              <label className="label">Included</label>
              <textarea className="input" name="includedItems" rows={2} />
            </div>
            <div>
              <label className="label">Excluded</label>
              <textarea className="input" name="excludedItems" rows={2} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Tour type</label>
              <select className="input" name="tourType" defaultValue="GROUP">
                <option value="GROUP">Group</option>
                <option value="PRIVATE">Private</option>
              </select>
            </div>
            <div>
              <label className="label">Duration (minutes)</label>
              <input className="input" type="number" min="0" name="durationMinutes" />
            </div>
            <div>
              <label className="label">Languages</label>
              <input className="input" name="languages" placeholder="English, Sinhala" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Min participants</label>
              <input className="input" type="number" min="0" name="minParticipants" />
            </div>
            <div>
              <label className="label">Max participants</label>
              <input className="input" type="number" min="0" name="maxParticipants" />
            </div>
            <div>
              <label className="label">Operating days</label>
              <input className="input" name="operatingDays" placeholder="Mon, Tue, Wed" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Starting times</label>
              <input className="input" name="startingTimes" placeholder="09:00, 13:30" />
            </div>
            <div>
              <label className="label">Meeting point</label>
              <input className="input" name="meetingPoint" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Pickup info</label>
              <textarea className="input" name="pickupInfo" rows={2} />
            </div>
            <div>
              <label className="label">Cancellation policy</label>
              <textarea className="input" name="cancellationPolicy" rows={2} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Price — adult (LKR)</label>
              <input className="input" type="number" min="0" step="0.01" name="priceAdult" />
            </div>
            <div>
              <label className="label">Price — child (LKR)</label>
              <input className="input" type="number" min="0" step="0.01" name="priceChild" />
            </div>
            {isCompanyWide(session.role) && (
              <div>
                <label className="label">Branch (optional)</label>
                <select className="input" name="branchId" defaultValue="">
                  <option value="">Company-wide</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="label">Photos</label>
            <input className="input" type="file" name="images" accept="image/*" multiple />
          </div>

          <div>
            <label className="label">Internal notes</label>
            <textarea className="input" name="internalNotes" rows={2} placeholder="Internal only — never shown on any marketplace listing" />
          </div>

          <button type="submit" className="btn-primary">
            Save tour as draft
          </button>
        </form>
      </div>

      <div className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">All tours</h2>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((s) => (
              <Link
                key={s}
                href={s === "ALL" ? "/travel/tours" : `/travel/tours?status=${s}`}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  (status ?? "ALL") === s ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {s === "ALL" ? "All" : STATUS_LABELS[s]}
              </Link>
            ))}
          </div>
        </div>
        {tours.length === 0 ? (
          <p className="text-sm text-stone-400">No tours match this filter.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {tours.map((tour) => (
              <li key={tour.id}>
                <Link
                  href={`/travel/tours/${tour.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-stone-50"
                >
                  <div>
                    <p className="font-medium text-ink-900">{tour.title}</p>
                    <p className="text-xs text-stone-500">
                      {tour.internalCode} · {tour.category}
                      {tour.branch ? ` · ${tour.branch.name}` : " · Company-wide"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {tour.internalNotes?.toLowerCase().includes("dev sample") && (
                      <span className="badge bg-amber-50 text-amber-700">Dev sample</span>
                    )}
                    {tour.priceAdult != null && (
                      <span className="text-sm font-medium text-ink-900">{formatMoney(tour.priceAdult)}</span>
                    )}
                    <span className={`badge ${STATUS_STYLES[tour.status]}`}>{STATUS_LABELS[tour.status]}</span>
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
