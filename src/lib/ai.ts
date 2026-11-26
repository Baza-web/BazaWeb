import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

type Provider = "anthropic" | "gemini" | null;

/**
 * Anthropic is tried first if configured (existing behavior unchanged for
 * anyone already using it); Google Gemini is the free-tier fallback for
 * businesses that don't want to add billing just for this feature.
 */
function activeProvider(): Provider {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GOOGLE_AI_API_KEY) return "gemini";
  return null;
}

export function aiConfigured() {
  return activeProvider() !== null;
}

let anthropicClient: Anthropic | null = null;
function ensureAnthropic() {
  if (anthropicClient) return anthropicClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

let geminiClient: GoogleGenAI | null = null;
function ensureGemini() {
  if (geminiClient) return geminiClient;
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;
  geminiClient = new GoogleGenAI({ apiKey });
  return geminiClient;
}

/**
 * Sends a prompt (optionally with an image) to whichever AI provider is
 * configured and returns the raw text response — the one place that knows
 * about Anthropic vs Gemini, so every feature below just writes its prompt
 * and parses JSON back, the same way regardless of provider. Returns null
 * if neither is configured, or if the call itself fails.
 */
async function runPrompt(prompt: string, image?: { buffer: Buffer; mediaType: string }): Promise<string | null> {
  const provider = activeProvider();

  if (provider === "anthropic") {
    const anthropic = ensureAnthropic();
    if (!anthropic) return null;
    const content: Anthropic.MessageParam["content"] = image
      ? [
          { type: "image", source: { type: "base64", media_type: image.mediaType as "image/jpeg", data: image.buffer.toString("base64") } },
          { type: "text", text: prompt },
        ]
      : prompt;
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 600,
      messages: [{ role: "user", content }],
    });
    return response.content.find((b) => b.type === "text")?.text ?? "";
  }

  if (provider === "gemini") {
    const gemini = ensureGemini();
    if (!gemini) return null;
    const contents = image
      ? [{ inlineData: { data: image.buffer.toString("base64"), mimeType: image.mediaType } }, { text: prompt }]
      : prompt;
    const response = await gemini.models.generateContent({ model: "gemini-3.8-flash", contents });
    return response.text ?? "";
  }

  return null;
}

export type ExtractedExpense = {
  amount: number | null;
  description: string | null;
  category: string | null;
  date: string | null;
};

const EXTRACTION_PROMPT = `You are reading a receipt, invoice, or order confirmation (as a photo, screenshot, or pasted email text) for a jewelry business's bookkeeping. Extract these fields and reply with ONLY a JSON object, no other text:

{
  "amount": <total amount paid as a plain number, no currency symbol, or null if unclear>,
  "description": <short description — vendor/merchant name and what was bought, or null>,
  "category": <one of: "Rent", "Utilities", "Supplies", "Salaries", "Marketing", "Transport", "Repairs", "Other" — pick the closest fit>,
  "date": <the transaction date in YYYY-MM-DD format if visible, or null>
}

If this isn't a receipt/invoice/order at all, or you genuinely cannot read it, reply with {"amount": null, "description": null, "category": null, "date": null}.`;

const EMPTY_EXPENSE: ExtractedExpense = { amount: null, description: null, category: null, date: null };

function parseExtraction(text: string): ExtractedExpense {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text);
    return {
      amount: typeof parsed.amount === "number" ? parsed.amount : null,
      description: typeof parsed.description === "string" ? parsed.description : null,
      category: typeof parsed.category === "string" ? parsed.category : null,
      date: typeof parsed.date === "string" ? parsed.date : null,
    };
  } catch {
    return EMPTY_EXPENSE;
  }
}

/** Extracts expense fields from a receipt/invoice image. Returns all-null fields if AI isn't configured or extraction fails. */
export async function extractExpenseFromImage(imageBuffer: Buffer, mediaType: string): Promise<ExtractedExpense> {
  try {
    const text = await runPrompt(EXTRACTION_PROMPT, { buffer: imageBuffer, mediaType });
    if (text === null) return EMPTY_EXPENSE;
    return parseExtraction(text);
  } catch (err) {
    console.error("AI receipt extraction failed:", err);
    return EMPTY_EXPENSE;
  }
}

/** Extracts expense fields from pasted text (an email body, a text order confirmation, etc). */
export async function extractExpenseFromText(text: string): Promise<ExtractedExpense> {
  try {
    const response = await runPrompt(`${EXTRACTION_PROMPT}\n\nText:\n${text}`);
    if (response === null) return EMPTY_EXPENSE;
    return parseExtraction(response);
  } catch (err) {
    console.error("AI receipt extraction failed:", err);
    return EMPTY_EXPENSE;
  }
}

export type ExtractedOrderItem = { description: string; quantity: number; priceEach: number | null };
export type ExtractedOrder = {
  customerName: string | null;
  customerPhone: string | null;
  orderNumber: string | null;
  items: ExtractedOrderItem[];
  discount: number | null;
  amountPaid: number | null;
  paymentMethod: "CASH" | "CARD" | "BANK_TRANSFER" | "MOBILE_MONEY" | "OTHER" | null;
  dueDate: string | null;
  handledBy: string | null;
  notes: string | null;
};

const ORDER_EXTRACTION_PROMPT = `You are reading a WhatsApp order conversation (as a screenshot or pasted chat text) for a jewelry business, to help staff record the sale or set up a custom production order. Extract these fields and reply with ONLY a JSON object, no other text:

{
  "customerName": <customer's name if mentioned, or null>,
  "customerPhone": <customer's phone number if visible, or null>,
  "orderNumber": <an order reference/number the business itself wrote, e.g. "ORDER NO: SB 7371" -> "SB 7371", or null if none is shown>,
  "items": [ { "description": <item name/description exactly as written — for a custom/bespoke piece, one item covering the whole design is fine>, "quantity": <number, default 1 if unclear>, "priceEach": <price per unit (or total price, for a one-off custom piece) as a plain number, or null if not stated> } ],
  "discount": <discount amount if mentioned, as a plain number, or null>,
  "amountPaid": <amount already paid or transferred if mentioned (a deposit or full payment), as a plain number, or null>,
  "paymentMethod": <one of "CASH", "CARD", "BANK_TRANSFER", "MOBILE_MONEY", "OTHER", or null if not mentioned>,
  "dueDate": <a promised/due/delivery date for the order, converted to YYYY-MM-DD regardless of how it was written (e.g. "03:12:2026" or "03/12/2026" -> "2026-12-03" — Sri Lankan documents write day first, then month, then year), or null if no date is mentioned>,
  "handledBy": <the business's own staff member's name if the message says who took/handled the order, e.g. "Order handled By: Ashmal" -> "Ashmal", or null if not mentioned — never the customer's or delivery contact's name>,
  "notes": <any other relevant context — delivery instructions, special requests, materials/weight/customization details — or null>
}

Ignore any marketing/promotional text (e.g. a "join us online" blurb) — only extract the actual order details.

If this isn't an order conversation at all, or you genuinely cannot read it, reply with {"customerName": null, "customerPhone": null, "orderNumber": null, "items": [], "discount": null, "amountPaid": null, "paymentMethod": null, "dueDate": null, "handledBy": null, "notes": null}.`;

const VALID_PAYMENT_METHODS = new Set(["CASH", "CARD", "BANK_TRANSFER", "MOBILE_MONEY", "OTHER"]);

const EMPTY_ORDER: ExtractedOrder = {
  customerName: null,
  customerPhone: null,
  orderNumber: null,
  items: [],
  discount: null,
  amountPaid: null,
  paymentMethod: null,
  dueDate: null,
  handledBy: null,
  notes: null,
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseOrderExtraction(text: string): ExtractedOrder {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text);
    const items: ExtractedOrderItem[] = Array.isArray(parsed.items)
      ? parsed.items
          .filter((i: unknown) => i && typeof (i as { description?: unknown }).description === "string")
          .map((i: { description: string; quantity?: unknown; priceEach?: unknown }) => ({
            description: i.description,
            quantity: typeof i.quantity === "number" && i.quantity > 0 ? Math.round(i.quantity) : 1,
            priceEach: typeof i.priceEach === "number" ? i.priceEach : null,
          }))
      : [];
    return {
      customerName: typeof parsed.customerName === "string" ? parsed.customerName : null,
      customerPhone: typeof parsed.customerPhone === "string" ? parsed.customerPhone : null,
      orderNumber: typeof parsed.orderNumber === "string" ? parsed.orderNumber : null,
      items,
      discount: typeof parsed.discount === "number" ? parsed.discount : null,
      amountPaid: typeof parsed.amountPaid === "number" ? parsed.amountPaid : null,
      paymentMethod:
        typeof parsed.paymentMethod === "string" && VALID_PAYMENT_METHODS.has(parsed.paymentMethod)
          ? (parsed.paymentMethod as ExtractedOrder["paymentMethod"])
          : null,
      dueDate: typeof parsed.dueDate === "string" && ISO_DATE.test(parsed.dueDate) ? parsed.dueDate : null,
      handledBy: typeof parsed.handledBy === "string" ? parsed.handledBy : null,
      notes: typeof parsed.notes === "string" ? parsed.notes : null,
    };
  } catch {
    return EMPTY_ORDER;
  }
}

/** Extracts order fields from a WhatsApp order screenshot. Returns an empty order if AI isn't configured or extraction fails. */
export async function extractOrderFromImage(imageBuffer: Buffer, mediaType: string): Promise<ExtractedOrder> {
  try {
    const text = await runPrompt(ORDER_EXTRACTION_PROMPT, { buffer: imageBuffer, mediaType });
    if (text === null) return EMPTY_ORDER;
    return parseOrderExtraction(text);
  } catch (err) {
    console.error("AI order extraction failed:", err);
    return EMPTY_ORDER;
  }
}

/** Extracts order fields from pasted WhatsApp chat text. */
export async function extractOrderFromText(text: string): Promise<ExtractedOrder> {
  try {
    const response = await runPrompt(`${ORDER_EXTRACTION_PROMPT}\n\nChat:\n${text}`);
    if (response === null) return EMPTY_ORDER;
    return parseOrderExtraction(response);
  } catch (err) {
    console.error("AI order extraction failed:", err);
    return EMPTY_ORDER;
  }
}
