import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { branchScope, canAccessTravel, isCompanyWide } from "@/lib/rbac";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import {
  updateTour,
  removeTourImage,
  submitTourForApproval,
  approveTour,
  sendTourBackToDraft,
  archiveTour,
  restoreTour,
} from "../../actions";
import { ArrowCounterClockwise, CheckCircle, Trash, WarningCircle } from "@/components/icons";

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

export default async function TourDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  if (!canAccessTravel(session.roles)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }

  const { id } = await params;
  const scope = branchScope(session);

  const tour = await db.tour.findFirst({
    where: { id, ...(tourScopeWhere(scope)) },
    include: { branch: true, createdBy: true, approvedBy: true },
  });
  if (!tour) notFound();

  const branches = isCompanyWide(session.roles) ? await db.branch.findMany({ orderBy: { name: "asc" } }) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/travel/tours" className="text-sm font-medium text-brand-600 hover:underline">
            ← All tours
          </Link>
          <h1 className="page-title mt-1 flex items-center gap-2">
            {tour.title}
            <span className={`badge ${STATUS_STYLES[tour.status]}`}>{STATUS_LABELS[tour.status]}</span>
          </h1>
          <p className="text-sm text-stone-500">
            {tour.internalCode} · {tour.category}
            {tour.branch ? ` · ${tour.branch.name}` : " · Company-wide"}
          </p>
        </div>
      </div>

      {tour.internalNotes?.toLowerCase().includes("dev sample") && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            This is a development sample tour, not a real published listing. It is not live on
            GetYourGuide or any marketplace.
          </p>
        </div>
      )}

      <div className="card">
        <h2 className="section-title mb-3">Lifecycle</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm text-stone-600">
          <p>
            Created by {tour.createdBy.name} on {formatDate(tour.createdAt)}
          </p>
          {tour.approvedBy && tour.approvedAt && (
            <p>
              · Approved by {tour.approvedBy.name} on {formatDateTime(tour.approvedAt)}
            </p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {tour.status === "DRAFT" && (
            <form action={submitTourForApproval.bind(null, tour.id)}>
              <button type="submit" className="btn-primary text-sm">
                Submit for approval
              </button>
            </form>
          )}
          {tour.status === "PENDING_APPROVAL" && (
            <>
              <form action={approveTour.bind(null, tour.id)}>
                <button type="submit" className="btn-primary text-sm">
                  <CheckCircle size={16} aria-hidden="true" /> Approve
                </button>
              </form>
              <form action={sendTourBackToDraft.bind(null, tour.id)} className="flex items-center gap-2">
                <input className="input text-sm" name="reason" placeholder="Reason (optional)" />
                <button type="submit" className="btn-secondary text-sm">
                  Send back to draft
                </button>
              </form>
            </>
          )}
          {tour.status !== "ARCHIVED" ? (
            <form action={archiveTour.bind(null, tour.id)}>
              <button type="submit" className="btn-secondary text-sm text-red-600">
                <Trash size={16} aria-hidden="true" /> Archive
              </button>
            </form>
          ) : (
            <form action={restoreTour.bind(null, tour.id)}>
              <button type="submit" className="btn-secondary text-sm">
                <ArrowCounterClockwise size={16} aria-hidden="true" /> Restore to draft
              </button>
            </form>
          )}
        </div>
      </div>

      {tour.images.length > 0 && (
        <div className="card">
          <h2 className="section-title mb-3">Photos</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tour.images.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <div key={img} className="group relative overflow-hidden rounded-lg border border-stone-200">
                <img src={img} alt="" className="h-28 w-full object-cover" />
                <form action={removeTourImage.bind(null, tour.id, img)} className="absolute right-1 top-1 opacity-0 group-hover:opacity-100">
                  <button type="submit" className="rounded-full bg-black/60 p-1 text-white" aria-label="Remove photo">
                    <Trash size={14} aria-hidden="true" />
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="section-title mb-3">Edit tour</h2>
        <form action={updateTour.bind(null, tour.id)} className="space-y-4" encType="multipart/form-data">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Title</label>
              <input className="input" name="title" required defaultValue={tour.title} />
            </div>
            <div>
              <label className="label">Category</label>
              <input className="input" name="category" required defaultValue={tour.category} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Destination</label>
              <input className="input" name="destination" defaultValue={tour.destination ?? ""} />
            </div>
            <div>
              <label className="label">Country</label>
              <input className="input" name="country" defaultValue={tour.country ?? ""} />
            </div>
            <div>
              <label className="label">City</label>
              <input className="input" name="city" defaultValue={tour.city ?? ""} />
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <textarea className="input" name="description" rows={3} defaultValue={tour.description ?? ""} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Highlights</label>
              <textarea className="input" name="highlights" rows={2} defaultValue={tour.highlights ?? ""} />
            </div>
            <div>
              <label className="label">Important info</label>
              <textarea className="input" name="importantInfo" rows={2} defaultValue={tour.importantInfo ?? ""} />
            </div>
            <div>
              <label className="label">Included</label>
              <textarea className="input" name="includedItems" rows={2} defaultValue={tour.includedItems ?? ""} />
            </div>
            <div>
              <label className="label">Excluded</label>
              <textarea className="input" name="excludedItems" rows={2} defaultValue={tour.excludedItems ?? ""} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Tour type</label>
              <select className="input" name="tourType" defaultValue={tour.tourType}>
                <option value="GROUP">Group</option>
                <option value="PRIVATE">Private</option>
              </select>
            </div>
            <div>
              <label className="label">Duration (minutes)</label>
              <input className="input" type="number" min="0" name="durationMinutes" defaultValue={tour.durationMinutes ?? ""} />
            </div>
            <div>
              <label className="label">Languages</label>
              <input className="input" name="languages" defaultValue={tour.languages.join(", ")} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Min participants</label>
              <input className="input" type="number" min="0" name="minParticipants" defaultValue={tour.minParticipants ?? ""} />
            </div>
            <div>
              <label className="label">Max participants</label>
              <input className="input" type="number" min="0" name="maxParticipants" defaultValue={tour.maxParticipants ?? ""} />
            </div>
            <div>
              <label className="label">Operating days</label>
              <input className="input" name="operatingDays" defaultValue={tour.operatingDays.join(", ")} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Starting times</label>
              <input className="input" name="startingTimes" defaultValue={tour.startingTimes.join(", ")} />
            </div>
            <div>
              <label className="label">Meeting point</label>
              <input className="input" name="meetingPoint" defaultValue={tour.meetingPoint ?? ""} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Pickup info</label>
              <textarea className="input" name="pickupInfo" rows={2} defaultValue={tour.pickupInfo ?? ""} />
            </div>
            <div>
              <label className="label">Cancellation policy</label>
              <textarea className="input" name="cancellationPolicy" rows={2} defaultValue={tour.cancellationPolicy ?? ""} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Price — adult (LKR)</label>
              <input className="input" type="number" min="0" step="0.01" name="priceAdult" defaultValue={tour.priceAdult ?? ""} />
            </div>
            <div>
              <label className="label">Price — child (LKR)</label>
              <input className="input" type="number" min="0" step="0.01" name="priceChild" defaultValue={tour.priceChild ?? ""} />
            </div>
            {isCompanyWide(session.roles) && (
              <div>
                <label className="label">Branch</label>
                <select className="input" name="branchId" defaultValue={tour.branchId ?? ""}>
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
            <label className="label">Add more photos</label>
            <input className="input" type="file" name="images" accept="image/*" multiple />
          </div>

          <div>
            <label className="label">Internal notes</label>
            <textarea className="input" name="internalNotes" rows={2} defaultValue={tour.internalNotes ?? ""} />
          </div>

          <button type="submit" className="btn-primary" disabled={tour.status === "ARCHIVED"}>
            Save changes
          </button>
          {tour.status === "ARCHIVED" && (
            <p className="text-xs text-stone-400">Restore this tour to draft before editing it.</p>
          )}
        </form>
      </div>
    </div>
  );
}

function tourScopeWhere(scope: { branchId?: string }) {
  if (!scope.branchId) return {};
  return { OR: [{ branchId: scope.branchId }, { branchId: null }] };
}
