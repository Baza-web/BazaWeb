import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { resolveQRTarget, hashIp } from "@/lib/qr";

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <p className="mb-6 text-center text-xs font-medium uppercase tracking-wide text-stone-400">Baza Boutique</p>
      <div className="card">{children}</div>
    </main>
  );
}

function PhotoGrid({ images }: { images: string[] }) {
  if (images.length === 0) return null;
  return (
    <div className="mb-4 grid grid-cols-2 gap-2">
      {images.slice(0, 4).map((src) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="" className="h-36 w-full rounded-lg object-cover" />
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <p className="py-0.5 text-sm">
      <span className="text-stone-500">{label}: </span>
      <span className="font-medium text-ink-900">{value}</span>
    </p>
  );
}

/**
 * Public, unauthenticated — anyone with the printed QR code reaches this.
 * Every field shown comes from resolveQRTarget's own allow-list, never a
 * raw model lookup here, so there's no way for this page to accidentally
 * grow a confidential field later.
 */
export default async function QRScanPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const qr = await db.qRCode.findUnique({ where: { code } });
  if (!qr || !qr.active) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-ink-900">This code isn&apos;t active</h1>
        <p className="mt-1 text-sm text-stone-500">It may have been retired. Please contact the boutique for help.</p>
      </Shell>
    );
  }

  const [ip, h] = await Promise.all([clientIp(), headers()]);
  await db.qRScan.create({
    data: {
      qrCodeId: qr.id,
      ipHash: ip === "unknown" ? null : hashIp(ip),
      userAgent: h.get("user-agent")?.slice(0, 300) || null,
      referrer: h.get("referer")?.slice(0, 300) || null,
    },
  });

  const target = await resolveQRTarget(qr.targetType, qr.targetId, qr.externalUrl);

  if (target.kind === "redirect") redirect(target.url);
  if (target.kind === "not_found") notFound();

  if (target.kind === "product") {
    return (
      <Shell>
        <h1 className="page-title text-lg">{target.name}</h1>
        <p className="mb-3 text-xs text-stone-500">SKU {target.sku} · {target.category}</p>
        <PhotoGrid images={target.images} />
        <Field label="Metal" value={[target.metalType, target.metalPurity].filter(Boolean).join(" ")} />
        <Field label="Gemstone" value={target.gemstoneType} />
        <Field label="Carat" value={target.caratWeight} />
        <Field label="Cut" value={target.cut} />
        <Field label="Clarity" value={target.clarity} />
        <Field label="Certification" value={target.certification} />
      </Shell>
    );
  }

  if (target.kind === "gemstone") {
    return (
      <Shell>
        <h1 className="page-title text-lg">{target.gemstoneType}</h1>
        {target.verified && <span className="badge mb-3 bg-emerald-100 text-emerald-700">✓ Verified authentic</span>}
        <PhotoGrid images={target.photos} />
        <Field label="Carat" value={target.caratWeight} />
        <Field label="Cut" value={target.cut} />
        <Field label="Colour" value={target.color} />
        <Field label="Clarity" value={target.clarity} />
        <Field label="Origin" value={target.origin} />
        <Field label="Treatment" value={target.treatment} />
        <Field label="Certificate #" value={target.certificateNumber} />
      </Shell>
    );
  }

  if (target.kind === "certificate") {
    const statusStyle =
      target.verificationStatus === "VERIFIED"
        ? "bg-emerald-100 text-emerald-700"
        : target.verificationStatus === "REJECTED"
          ? "bg-red-100 text-red-700"
          : "bg-amber-100 text-amber-700";
    return (
      <Shell>
        <h1 className="page-title text-lg">Gold Certificate #{target.certificateNumber}</h1>
        <span className={`badge mt-2 ${statusStyle}`}>{target.verificationStatus}</span>
        <div className="mt-3">
          <Field label="Issuing authority" value={target.issuingAuthority} />
          <Field label="Specification" value={target.goldSpecification} />
        </div>
      </Shell>
    );
  }

  if (target.kind === "boutique") {
    const mapUrl = target.latitude && target.longitude ? `https://maps.google.com/?q=${target.latitude},${target.longitude}` : null;
    return (
      <Shell>
        <h1 className="page-title text-lg">{target.name}</h1>
        <div className="mt-2">
          <Field label="Address" value={target.address} />
          <Field label="Phone" value={target.phone} />
        </div>
        {mapUrl && (
          <a href={mapUrl} className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline">
            Open in Maps →
          </a>
        )}
      </Shell>
    );
  }

  // target.kind === "tour"
  return (
    <Shell>
      <h1 className="page-title text-lg">{target.title}</h1>
      <p className="mb-3 text-xs text-stone-500">{target.destination}</p>
      <PhotoGrid images={target.images} />
      {target.description && <p className="mb-3 text-sm text-ink-800">{target.description}</p>}
      <Field label="Duration" value={target.durationMinutes ? `${target.durationMinutes} min` : null} />
      <Field label="Price" value={target.priceAdult ? `${target.currency} ${target.priceAdult}` : null} />
    </Shell>
  );
}
