import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireSessionOrRedirect } from "@/lib/auth";
import { canAccessCreativeHub, STAFF_MANAGER_ROLES } from "@/lib/rbac";
import { formatDateTime } from "@/lib/utils";
import { updateSocialPost, updateSocialPostStatus, deleteSocialPost, approveSocialPost } from "../../actions";

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  WHATSAPP_STATUS: "WhatsApp Status",
  OTHER: "Other",
};

function toLocalInput(d: Date | null) {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function SocialPostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  if (!canAccessCreativeHub(session.role)) {
    return <p className="text-sm text-stone-500">You don&apos;t have access to this page.</p>;
  }
  const { id } = await params;

  const post = await db.socialPost.findUnique({
    where: { id },
    include: {
      group: { include: { members: true } },
      assignedTo: true,
      createdBy: true,
      approvedBy: true,
      brand: true,
    },
  });
  if (!post) notFound();

  const isMember = post.group.members.some((m) => m.id === session.staffId);
  const isManager = STAFF_MANAGER_ROLES.includes(session.role);
  if (!isMember && !isManager) notFound();

  const brands = await db.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-stone-500">
            {post.group.name} · {post.brand.name} · {PLATFORM_LABELS[post.platform]}
          </p>
          <h1 className="page-title">{post.title}</h1>
          <p className="text-sm text-stone-500">
            Created by {post.createdBy.name}
            {post.assignedTo ? ` · Assigned to ${post.assignedTo.name}` : ""}
          </p>
        </div>
        <Link href="/creative" className="btn-secondary">
          Back
        </Link>
      </div>

      <div className="card">
        <p className="mb-2 text-sm font-medium">Status: {post.status}</p>
        <form action={updateSocialPostStatus.bind(null, post.id)} className="flex gap-2">
          <select className="input max-w-[200px]" name="status" defaultValue={post.status}>
            <option value="IDEA">Idea</option>
            <option value="DRAFTING">Drafting</option>
            <option value="READY">Ready</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="POSTED">Posted</option>
          </select>
          <button type="submit" className="btn-secondary">
            Update
          </button>
        </form>
        {post.postedAt && <p className="mt-2 text-xs text-stone-500">Posted {formatDateTime(post.postedAt)}</p>}
      </div>

      {post.autoPublish && (
        <div className="card">
          <h2 className="mb-2 font-medium">Instagram auto-publish</h2>
          {post.publishedToInstagramAt ? (
            <p className="text-sm text-green-700">
              Published to Instagram {formatDateTime(post.publishedToInstagramAt)}.
            </p>
          ) : post.approvedById ? (
            <p className="text-sm text-stone-600">
              Approved by {post.approvedBy?.name} on {formatDateTime(post.approvedAt!)} — will publish automatically
              once its scheduled time arrives.
            </p>
          ) : (
            <p className="text-sm text-amber-700">Waiting on Owner/Admin approval before it can auto-publish.</p>
          )}
          {post.publishError && (
            <p className="mt-2 text-sm text-red-700">Last attempt failed: {post.publishError}</p>
          )}
          {isManager && !post.approvedById && !post.publishedToInstagramAt && (
            <form action={approveSocialPost.bind(null, post.id)} className="mt-3">
              <button type="submit" className="btn-primary text-sm">
                Approve for auto-publish
              </button>
            </form>
          )}
        </div>
      )}

      {post.images.length > 0 && (
        <div className="card">
          <h2 className="mb-3 font-medium">Reference images</h2>
          <div className="grid grid-cols-3 gap-2">
            {post.images.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={img} src={img} alt="" className="aspect-square rounded-lg object-cover" />
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 font-medium">Edit details</h2>
        <form action={updateSocialPost.bind(null, post.id)} className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input className="input" name="title" defaultValue={post.title} required />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Brand</label>
              <select className="input" name="brandId" defaultValue={post.brandId}>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Platform</label>
              <select className="input" name="platform" defaultValue={post.platform}>
                {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Assign to</label>
              <select className="input" name="assignedToId" defaultValue={post.assignedToId ?? ""}>
                <option value="">Unassigned</option>
                {post.group.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Scheduled date & time</label>
            <input
              className="input"
              name="scheduledAt"
              type="datetime-local"
              defaultValue={toLocalInput(post.scheduledAt)}
            />
          </div>
          <div>
            <label className="label">Caption</label>
            <textarea className="input" name="caption" rows={3} defaultValue={post.caption ?? ""} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" name="notes" rows={2} defaultValue={post.notes ?? ""} />
          </div>
          <div>
            <label className="label">Add more images</label>
            <input className="input" name="images" type="file" accept="image/*" multiple />
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              name="autoPublish"
              defaultChecked={post.autoPublish}
              className="h-4 w-4 rounded border-stone-300"
            />
            Auto-publish to Instagram once approved (Instagram posts only)
          </label>
          {post.approvedById && !post.publishedToInstagramAt && (
            <p className="text-xs text-amber-700">
              Saving will clear the existing approval — it&apos;ll need to be approved again.
            </p>
          )}
          <button type="submit" className="btn-primary">
            Save changes
          </button>
        </form>
      </div>

      <form action={deleteSocialPost.bind(null, post.id)}>
        <button type="submit" className="text-sm text-red-600 hover:underline">
          Delete this post
        </button>
      </form>
    </div>
  );
}
