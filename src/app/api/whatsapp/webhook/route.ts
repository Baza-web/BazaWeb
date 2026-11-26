import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifyStaff } from "@/lib/notifications";
import { extractOrderFromImage, extractOrderFromText, aiConfigured } from "@/lib/ai";
import { saveUploadedFile } from "@/lib/uploads";
import { verifyWebhookSignature, fetchWhatsAppMedia, parseWebhookMessages } from "@/lib/whatsapp";

const SALE_RECORDER_ROLES = ["OWNER", "ADMIN", "MANAGER", "SALES", "ACCOUNTANT"] as const;

/**
 * Meta's subscription verification handshake — called once when the webhook
 * URL is registered in the App Dashboard, and whenever the verify token is
 * rotated. Must echo back `hub.challenge` as plain text if the mode/token
 * match what we configured, or Meta refuses to save the subscription.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Receives inbound WhatsApp messages from Meta's Cloud API. Every delivery
 * is signature-verified against our App Secret before we touch it. We never
 * create a Sale here — just an AI-extracted, unreviewed
 * WhatsAppInboundOrder row for staff to pick up on the review queue
 * (/whatsapp-orders), exactly like the existing manual "Scan an order" flow
 * requires a human to click Record sale.
 */
export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const rawBody = await request.text();

  if (!appSecret || !verifyWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const messages = parseWebhookMessages(payload);

  for (const message of messages) {
    try {
      const existing = await db.whatsAppInboundOrder.findUnique({ where: { waMessageId: message.waMessageId } });
      if (existing) continue;

      let extracted: Awaited<ReturnType<typeof extractOrderFromText>>;
      let mediaPath: string | null = null;

      if (!aiConfigured()) {
        extracted = {
          customerName: null,
          customerPhone: message.fromPhone,
          orderNumber: null,
          items: [],
          discount: null,
          amountPaid: null,
          paymentMethod: null,
          dueDate: null,
          handledBy: null,
          notes: message.text,
        };
      } else if (message.messageType === "image" && message.imageMediaId && accessToken) {
        const media = await fetchWhatsAppMedia(message.imageMediaId, accessToken);
        if (media) {
          extracted = await extractOrderFromImage(media.buffer, media.mimeType);
          const mediaFile = new File([media.buffer], "whatsapp-order.jpg", { type: media.mimeType });
          mediaPath = await saveUploadedFile(mediaFile, "whatsapp-orders");
        } else {
          extracted = {
            customerName: null,
            customerPhone: message.fromPhone,
            orderNumber: null,
            items: [],
            discount: null,
            amountPaid: null,
            paymentMethod: null,
            dueDate: null,
            handledBy: null,
            notes: message.text,
          };
        }
      } else if (message.text) {
        extracted = await extractOrderFromText(message.text);
      } else {
        continue;
      }

      await db.whatsAppInboundOrder.create({
        data: {
          fromPhone: message.fromPhone,
          waMessageId: message.waMessageId,
          messageType: message.messageType,
          rawText: message.text,
          mediaPath,
          externalOrderNumber: extracted.orderNumber,
          customerNameGuess: extracted.customerName,
          extractedJson: extracted,
        },
      });

      const recipients = await db.staff.findMany({
        where: {
          active: true,
          OR: [{ role: { in: [...SALE_RECORDER_ROLES] } }, { additionalRoles: { hasSome: [...SALE_RECORDER_ROLES] } }],
        },
      });
      await Promise.all(
        recipients.map((staff) =>
          notifyStaff(
            staff.id,
            "WHATSAPP_ORDER_RECEIVED",
            "New WhatsApp order",
            extracted.customerName ? `From ${extracted.customerName} — review and record the sale.` : "Review and record the sale.",
            `/whatsapp-orders`,
          ),
        ),
      );
    } catch (err) {
      console.error("WhatsApp webhook: failed to process one message:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
