/**
 * Seeds 3 development-sample tours for the Travel & Experiences module so an
 * Owner/Admin can see Tour Management working with real-looking data instead
 * of an empty list. Every seeded tour is tagged "Dev sample" in its internal
 * notes and shown with a "Dev sample" badge in the UI — none of them are
 * published on GetYourGuide or any marketplace.
 *
 * Safe to run once on a live system: it attaches tours to the first Owner
 * account and first Branch it finds, and running it a second time is a
 * no-op (it skips any tour whose title already exists).
 *
 * Run inside the app container:
 *   docker compose exec app node_modules/.bin/tsx prisma/travel-demo-tours.ts
 */
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const db = new PrismaClient();

function tourCode() {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `TOUR-${Date.now().toString(36).toUpperCase()}-${random}`;
}

const DEV_NOTE =
  "Dev sample tour — seeded for Travel & Experiences demoing. Not published on GetYourGuide or any marketplace; do not treat as a real, bookable listing.";

async function main() {
  const owner = await db.staff.findFirst({ where: { role: "OWNER", active: true }, orderBy: { createdAt: "asc" } });
  if (!owner) {
    console.log("No active Owner account found — create one first, then re-run this script.");
    return;
  }
  const branch = await db.branch.findFirst({ orderBy: { createdAt: "asc" } });

  const tours = [
    {
      title: "Lotus Tower Lunch Experience",
      category: "City experience",
      destination: "Colombo",
      country: "Sri Lanka",
      city: "Colombo",
      durationMinutes: 150,
      description:
        "A relaxed half-day visit to the Colombo Lotus Tower observation deck followed by lunch at its revolving restaurant, with panoramic views of the city and harbour.",
      highlights: "360° observation deck access, revolving restaurant lunch, harbour views, photo stops",
      includedItems: "Entry ticket, set lunch, air-conditioned transport from meeting point",
      excludedItems: "Personal expenses, additional drinks, gratuities",
      languages: ["English", "Sinhala"],
      tourType: "GROUP" as const,
      minParticipants: 1,
      maxParticipants: 12,
      meetingPoint: branch ? `Baza Boutique — ${branch.name}` : undefined,
      pickupInfo: "Pickup available within central Colombo on request, 30 minutes before start time.",
      cancellationPolicy: "Free cancellation up to 24 hours before the experience.",
      importantInfo: "Smart casual dress code for the restaurant. Confirm dietary requirements in advance.",
      priceAdult: 8500,
      priceChild: 5000,
      operatingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      startingTimes: ["12:00", "18:30"],
    },
    {
      title: "Ambuluwawa Tower Private Day Trip",
      category: "Day trip",
      destination: "Gampola",
      country: "Sri Lanka",
      city: "Gampola",
      durationMinutes: 480,
      description:
        "A full-day private excursion from Colombo to the Ambuluwawa Biodiversity Complex, climbing the spiral tower for 360° views over the central hills before returning in the evening.",
      highlights: "Private vehicle and driver, Ambuluwawa spiral tower climb, countryside scenery, flexible stops",
      includedItems: "Private transport, driver, entry fees, bottled water",
      excludedItems: "Meals, personal expenses, guide gratuity",
      languages: ["English"],
      tourType: "PRIVATE" as const,
      minParticipants: 1,
      maxParticipants: 4,
      meetingPoint: branch ? `Guest's hotel or Baza Boutique — ${branch.name}` : undefined,
      pickupInfo: "Hotel pickup included within greater Colombo.",
      cancellationPolicy: "Free cancellation up to 48 hours before departure; 50% charge within 48 hours.",
      importantInfo:
        "The tower climb involves a narrow spiral staircase — not recommended for those with mobility concerns.",
      priceAdult: 32000,
      priceChild: 0,
      operatingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      startingTimes: ["07:00"],
    },
    {
      title: "Jewelry Making Workshop in Colombo",
      category: "Workshop",
      destination: "Colombo",
      country: "Sri Lanka",
      city: "Colombo",
      durationMinutes: 180,
      description:
        "A hands-on introductory jewelry-making workshop at a Baza Boutique studio, guided by a resident craftsman — guests design and finish a simple silver piece to take home.",
      highlights: "Guided by a Baza craftsman, hands-on metalwork, take home your own piece, small-group setting",
      includedItems: "All materials and tools, craftsman guidance, finished take-home piece, light refreshments",
      excludedItems: "Transport to the studio, additional custom stones",
      languages: ["English", "Sinhala"],
      tourType: "GROUP" as const,
      minParticipants: 2,
      maxParticipants: 6,
      meetingPoint: branch ? `Baza Boutique — ${branch.name} workshop studio` : undefined,
      pickupInfo: "No pickup — guests make their own way to the studio.",
      cancellationPolicy: "Free cancellation up to 24 hours before the session.",
      importantInfo: "Closed-toe shoes recommended. Not suitable for children under 10.",
      priceAdult: 12000,
      priceChild: 0,
      operatingDays: ["Tue", "Thu", "Sat"],
      startingTimes: ["10:00", "14:00"],
    },
  ];

  for (const t of tours) {
    const existing = await db.tour.findFirst({ where: { title: t.title } });
    if (existing) {
      console.log("skip (already exists):", t.title);
      continue;
    }
    const created = await db.tour.create({
      data: {
        ...t,
        branchId: branch?.id ?? null,
        internalNotes: DEV_NOTE,
        internalCode: tourCode(),
        createdById: owner.id,
        status: "DRAFT",
      },
    });
    console.log("created:", created.internalCode, created.title);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
