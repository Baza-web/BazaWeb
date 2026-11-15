import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { instagramConfigured, publishToInstagram, toPublicUrl } from "@/lib/instagram";
import { notifyStaff } from "@/lib/notifications";

/**
 * Triggered every few minutes by a cron job on the server (see DEPLOY.md).
 * Publishes any Instagram post that a Creative scheduled, turned on
 * auto-publish for, and an Owner/Admin has approved — only once its
 * scheduled time has arrived. Nothing here is published without that
 * explicit approval step.
 */
export async function GET(request: Request) {
  const cronToken = process.env.CRON_TOKEN;
  if (!cronToken) {
    return NextResponse.json({ error: "CRON_TOKEN is not configured." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get("token") !== cronToken) {
    return NextResponse.json({ error: "Invalid or missing token." }, { status: 403 });
  }

  if (!instagramConfigured()) {
    return NextResponse.json({ skipped: true, reason: "Instagram API credentials are not configured." });
  }

  const duePosts = await db.socialPost.findMany({
    where: {
      platform: "INSTAGRAM",
      autoPublish: true,
      approvedById: { not: null },
      publishedToInstagramAt: null,
      scheduledAt: { lte: new Date() },
    },
    include: { createdBy: true, approvedBy: true },
  });

  let published = 0;
  let failed = 0;

  for (const post of duePosts) {
    try {
      if (post.images.length === 0) {
        throw new Error("This post has no image to publish.");
      }
      const { mediaId } = await publishToInstagram({
        imageUrl: toPublicUrl(post.images[0]),
        caption: post.caption ?? "",
      });
      await db.socialPost.update({
        where: { id: post.id },
        data: { status: "POSTED", postedAt: new Date(), publishedToInstagramAt: new Date(), instagramMediaId: mediaId, publishError: null },
      });
      published++;
      await notifyStaff(
        post.createdById,
        "SYSTEM",
        "Published to Instagram",
        `"${post.title}" was automatically posted to Instagram.`,
        "/creative",
      );
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : "Unknown error publishing to Instagram.";
      await db.socialPost.update({ where: { id: post.id }, data: { publishError: message } });
      await notifyStaff(
        post.approvedById!,
        "SYSTEM",
        "Instagram publish failed",
        `"${post.title}" failed to publish: ${message}`,
        `/creative/posts/${post.id}`,
      );
    }
  }

  return NextResponse.json({ checked: duePosts.length, published, failed });
}
