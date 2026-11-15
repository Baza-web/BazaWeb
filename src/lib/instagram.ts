import "server-only";

const GRAPH_API_VERSION = "v21.0";

export function instagramConfigured() {
  return Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID);
}

/** Builds a full, public URL for an uploaded file, since Instagram's API must fetch the image itself. */
export function toPublicUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path; // already absolute (e.g. Vercel Blob)
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL isn't set — Instagram needs a public URL to fetch the image from.");
  return `${base.replace(/\/$/, "")}${path}`;
}

/**
 * Publishes a single image post to Instagram via the Graph API's two-step
 * Content Publishing flow: create a media container, then publish it.
 * https://developers.facebook.com/docs/instagram-platform/content-publishing
 */
export async function publishToInstagram(params: { imageUrl: string; caption: string }): Promise<{ mediaId: string }> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igUserId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!token || !igUserId) {
    throw new Error("Instagram isn't configured — set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID.");
  }

  const containerRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: params.imageUrl, caption: params.caption, access_token: token }),
  });
  const containerData = await containerRes.json();
  if (!containerRes.ok || !containerData.id) {
    throw new Error(containerData?.error?.message || "Failed to create the Instagram media container.");
  }

  const publishRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: containerData.id, access_token: token }),
  });
  const publishData = await publishRes.json();
  if (!publishRes.ok || !publishData.id) {
    throw new Error(publishData?.error?.message || "Failed to publish to Instagram.");
  }

  return { mediaId: publishData.id };
}
