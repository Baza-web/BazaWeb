import "server-only";
import crypto from "node:crypto";

/**
 * Verifies Meta's X-Hub-Signature-256 header against our App Secret so the
 * webhook route only acts on deliveries that actually came from Meta — the
 * header format is "sha256=<hex hmac>" over the exact raw request body.
 * Must run on the raw, unparsed body: re-serializing parsed JSON can change
 * whitespace and make a valid signature fail to match.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader) return false;
  const [scheme, hex] = signatureHeader.split("=");
  if (scheme !== "sha256" || !hex) return false;

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const givenBuf = Buffer.from(hex, "hex");
  if (expectedBuf.length !== givenBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, givenBuf);
}

const GRAPH_API_VERSION = "v21.0";

/**
 * Downloads an inbound media attachment (image) from Meta's Graph API.
 * Media IDs expire and aren't directly fetchable — this is Meta's documented
 * two-step flow: resolve the ID to a short-lived signed URL, then download
 * it with the same access token as a Bearer header.
 */
export async function fetchWhatsAppMedia(
  mediaId: string,
  accessToken: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const metaRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!metaRes.ok) return null;
    const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
    if (!meta.url) return null;

    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!fileRes.ok) return null;
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    return { buffer, mimeType: meta.mime_type ?? "image/jpeg" };
  } catch (err) {
    console.error("fetchWhatsAppMedia failed:", err);
    return null;
  }
}

export type WhatsAppInboundMessage = {
  waMessageId: string;
  fromPhone: string;
  messageType: "text" | "image";
  text: string | null;
  imageMediaId: string | null;
};

/** Pulls the message(s) out of a Meta Cloud API webhook POST body's `entry[].changes[].value.messages[]` shape. Ignores anything that isn't a plain text or image message (status updates, reactions, etc). */
export function parseWebhookMessages(body: unknown): WhatsAppInboundMessage[] {
  const out: WhatsAppInboundMessage[] = [];
  if (!body || typeof body !== "object") return out;
  const entries = (body as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: unknown }).value as
        | { messages?: unknown }
        | undefined;
      const messages = value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const m of messages) {
        const msg = m as {
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
          image?: { id?: string; caption?: string };
        };
        if (!msg.id || !msg.from) continue;
        if (msg.type === "text" && msg.text?.body) {
          out.push({ waMessageId: msg.id, fromPhone: msg.from, messageType: "text", text: msg.text.body, imageMediaId: null });
        } else if (msg.type === "image" && msg.image?.id) {
          out.push({
            waMessageId: msg.id,
            fromPhone: msg.from,
            messageType: "image",
            text: msg.image.caption ?? null,
            imageMediaId: msg.image.id,
          });
        }
      }
    }
  }
  return out;
}
