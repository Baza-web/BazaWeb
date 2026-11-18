import "server-only";
import { round2 } from "./utils";

export type RfmSegment = "CHAMPION" | "AT_RISK" | "LOST" | "NEW" | "NONE";

export const RFM_SEGMENT_LABELS: Record<RfmSegment, string> = {
  CHAMPION: "Champion",
  AT_RISK: "At risk",
  LOST: "Lost",
  NEW: "New",
  NONE: "—",
};

export type RfmStats = { frequency: number; monetary: number; recencyDays: number | null };

export function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

export function computeRfmStats(sales: { total: number; createdAt: Date }[]): RfmStats {
  if (sales.length === 0) return { frequency: 0, monetary: 0, recencyDays: null };
  const lastPurchase = sales.reduce((latest, s) => (s.createdAt > latest ? s.createdAt : latest), sales[0].createdAt);
  return {
    frequency: sales.length,
    monetary: round2(sales.reduce((s, x) => s + x.total, 0)),
    recencyDays: daysSince(lastPurchase),
  };
}

/** Mirrors the bucket definitions Reports > Deep Insights has always used — see classifyRfmSegment's callers for why a customer can fall into none of them (e.g. two purchases, both over 90 days but under a year ago, isn't "at risk" by this product's own threshold). */
export function classifyRfmSegment(stats: RfmStats): RfmSegment {
  if (stats.recencyDays === null) return "NONE";
  if (stats.recencyDays > 365) return "LOST";
  if (stats.recencyDays <= 90 && stats.frequency >= 3) return "CHAMPION";
  if (stats.recencyDays <= 90 && stats.frequency === 1) return "NEW";
  if (stats.recencyDays > 90 && stats.recencyDays <= 365 && stats.frequency >= 2) return "AT_RISK";
  return "NONE";
}
