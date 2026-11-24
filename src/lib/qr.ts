import "server-only";
import crypto from "crypto";
import { headers } from "next/headers";
import QRCodeLib from "qrcode";
import { db } from "./db";
import type { QRTargetType } from "@prisma/client";

/** Short, URL-safe, unambiguous (no 0/O/1/I/l) — printed on a physical label, so it must be easy to read back if ever typed by hand. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateQRCodeSlug(): string {
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
  return code;
}

/**
 * Prefers the explicit NEXT_PUBLIC_APP_URL (stable across request/cron contexts, and
 * what DEPLOY.md tells the operator to set), but falls back to the real host nginx
 * forwarded for this request (same source requestOrigin.ts trusts) rather than
 * throwing — a missing env var shouldn't take down the whole QR Management page.
 */
async function appUrl() {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (base) return base.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) throw new Error("Couldn't determine this site's public URL — set NEXT_PUBLIC_APP_URL and redeploy.");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function qrScanUrl(code: string) {
  return `${await appUrl()}/q/${code}`;
}

/** PNG data URL — embedded directly in the admin page and the printable label, no file storage needed since it's cheap to regenerate from the code string. */
export async function generateQRImageDataUrl(code: string): Promise<string> {
  return QRCodeLib.toDataURL(await qrScanUrl(code), { width: 480, margin: 2 });
}

type PublicTarget =
  | { kind: "redirect"; url: string }
  | { kind: "product"; name: string; sku: string; category: string; metalType: string | null; metalPurity: string | null; gemstoneType: string | null; caratWeight: number | null; clarity: string | null; cut: string | null; certification: string | null; images: string[] }
  | { kind: "gemstone"; gemstoneType: string; caratWeight: number | null; cut: string | null; color: string | null; clarity: string | null; origin: string | null; treatment: string | null; certificateNumber: string | null; verified: boolean; photos: string[] }
  | { kind: "certificate"; certificateNumber: string; issuingAuthority: string | null; goldSpecification: string | null; verificationStatus: string }
  | { kind: "boutique"; name: string; address: string | null; phone: string | null; latitude: number | null; longitude: number | null }
  | { kind: "tour"; title: string; description: string | null; destination: string | null; durationMinutes: number | null; priceAdult: number | null; currency: string; images: string[] }
  | { kind: "not_found" };

/**
 * Resolves a QR code's scan-time destination to ONLY public-safe fields —
 * never cost price, never a customer's name, never an order's value. A
 * target that's been deleted since the QR was printed (or deactivated)
 * resolves to not_found rather than throwing, since a stale physical
 * label is an ordinary, expected occurrence, not an error.
 */
export async function resolveQRTarget(targetType: QRTargetType, targetId: string | null, externalUrl: string | null): Promise<PublicTarget> {
  if (targetType === "CAMPAIGN") {
    return externalUrl ? { kind: "redirect", url: externalUrl } : { kind: "not_found" };
  }
  if (!targetId) return { kind: "not_found" };

  switch (targetType) {
    case "PRODUCT": {
      const item = await db.inventoryItem.findUnique({ where: { id: targetId } });
      if (!item) return { kind: "not_found" };
      return {
        kind: "product",
        name: item.name,
        sku: item.sku,
        category: item.category,
        metalType: item.metalType,
        metalPurity: item.metalPurity,
        gemstoneType: item.gemstoneType,
        caratWeight: item.caratWeight,
        clarity: item.clarity,
        cut: item.cut,
        certification: item.certification,
        images: item.images,
      };
    }
    case "GEMSTONE": {
      const gem = await db.orderGemstoneSpec.findUnique({ where: { id: targetId } });
      if (!gem) return { kind: "not_found" };
      return {
        kind: "gemstone",
        gemstoneType: gem.gemstoneType,
        caratWeight: gem.caratWeight,
        cut: gem.cut,
        color: gem.color,
        clarity: gem.clarity,
        origin: gem.origin,
        treatment: gem.treatment,
        certificateNumber: gem.certificateNumber,
        verified: gem.verified,
        photos: gem.photos,
      };
    }
    case "CERTIFICATE": {
      const cert = await db.goldCertificate.findUnique({ where: { id: targetId } });
      if (!cert) return { kind: "not_found" };
      return {
        kind: "certificate",
        certificateNumber: cert.certificateNumber,
        issuingAuthority: cert.issuingAuthority,
        goldSpecification: cert.goldSpecification,
        verificationStatus: cert.verificationStatus,
      };
    }
    case "BOUTIQUE": {
      const branch = await db.branch.findUnique({ where: { id: targetId } });
      if (!branch) return { kind: "not_found" };
      return {
        kind: "boutique",
        name: branch.name,
        address: branch.address,
        phone: branch.phone,
        latitude: branch.latitude,
        longitude: branch.longitude,
      };
    }
    case "TRAVEL_EXPERIENCE": {
      const tour = await db.tour.findUnique({ where: { id: targetId } });
      if (!tour) return { kind: "not_found" };
      return {
        kind: "tour",
        title: tour.title,
        description: tour.description,
        destination: tour.destination,
        durationMinutes: tour.durationMinutes,
        priceAdult: tour.priceAdult,
        currency: tour.currency,
        images: tour.images,
      };
    }
    default:
      return { kind: "not_found" };
  }
}

/**
 * Server-side defense-in-depth: the create/edit forms only ever submit a targetId drawn
 * from the list matching the selected targetType, but this confirms that pairing still
 * holds at submit time (not stale, not tampered with) instead of trusting the client.
 */
export async function targetExists(targetType: QRTargetType, targetId: string): Promise<boolean> {
  switch (targetType) {
    case "PRODUCT":
      return (await db.inventoryItem.count({ where: { id: targetId } })) > 0;
    case "GEMSTONE":
      return (await db.orderGemstoneSpec.count({ where: { id: targetId } })) > 0;
    case "CERTIFICATE":
      return (await db.goldCertificate.count({ where: { id: targetId } })) > 0;
    case "BOUTIQUE":
      return (await db.branch.count({ where: { id: targetId } })) > 0;
    case "TRAVEL_EXPERIENCE":
      return (await db.tour.count({ where: { id: targetId } })) > 0;
    default:
      return false;
  }
}

/** Hashed, never the raw address — enough to de-duplicate/estimate unique scanners without storing anyone's real IP. */
export function hashIp(ip: string) {
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
}
