import "server-only";
import { db } from "./db";

/** Returns the saved sidebar order (list of hrefs), or [] if Owner/Admin has never customized it. */
export async function getNavOrder(): Promise<string[]> {
  const row = await db.navSettings.findUnique({ where: { id: "singleton" } });
  return row?.order ?? [];
}

/**
 * Reorders `items` to match `order` (a list of hrefs), placing any item not
 * mentioned in `order` after the ones that are, in their original relative
 * order — so a newly added nav entry (or one hidden by RBAC for this role)
 * never disappears or jumps unexpectedly, it just lands at the end until
 * someone drags it somewhere else.
 */
export function applyNavOrder<T extends { href: string }>(items: T[], order: string[]): T[] {
  if (order.length === 0) return items;
  const rank = new Map(order.map((href, i) => [href, i]));
  return [...items].sort((a, b) => {
    const ra = rank.has(a.href) ? rank.get(a.href)! : order.length + items.indexOf(a);
    const rb = rank.has(b.href) ? rank.get(b.href)! : order.length + items.indexOf(b);
    return ra - rb;
  });
}
