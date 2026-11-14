import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function ensureConfigured() {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  client = new Anthropic({ apiKey });
  return client;
}

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
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
    return { amount: null, description: null, category: null, date: null };
  }
}

/** Extracts expense fields from a receipt/invoice image. Returns all-null fields if AI isn't configured or extraction fails. */
export async function extractExpenseFromImage(imageBuffer: Buffer, mediaType: string): Promise<ExtractedExpense> {
  const anthropic = ensureConfigured();
  if (!anthropic) return { amount: null, description: null, category: null, date: null };

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType as "image/jpeg", data: imageBuffer.toString("base64") },
            },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
    });
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    return parseExtraction(text);
  } catch (err) {
    console.error("AI receipt extraction failed:", err);
    return { amount: null, description: null, category: null, date: null };
  }
}

/** Extracts expense fields from pasted text (an email body, a text order confirmation, etc). */
export async function extractExpenseFromText(text: string): Promise<ExtractedExpense> {
  const anthropic = ensureConfigured();
  if (!anthropic) return { amount: null, description: null, category: null, date: null };

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 300,
      messages: [{ role: "user", content: `${EXTRACTION_PROMPT}\n\nText:\n${text}` }],
    });
    const content = response.content.find((b) => b.type === "text")?.text ?? "";
    return parseExtraction(content);
  } catch (err) {
    console.error("AI receipt extraction failed:", err);
    return { amount: null, description: null, category: null, date: null };
  }
}

export type ExtractedOrderItem = { description: string; quantity: number; priceEach: number | null };
export type ExtractedOrder = {
  customerName: string | null;
  customerPhone: string | null;
  items: ExtractedOrderItem[];
  discount: number | null;
  amountPaid: number | null;
  paymentMethod: "CASH" | "CARD" | "BANK_TRANSFER" | "MOBILE_MONEY" | "OTHER" | null;
  notes: string | null;
};

const ORDER_EXTRACTION_PROMPT = `You are reading a WhatsApp order conversation (as a screenshot or pasted chat text) for a jewelry business, to help staff record the sale. Extract these fields and reply with ONLY a JSON object, no other text:

{
  "customerName": <customer's name if mentioned, or null>,
  "customerPhone": <customer's phone number if visible, or null>,
  "items": [ { "description": <item name/description exactly as written>, "quantity": <number, default 1 if unclear>, "priceEach": <price per unit as a plain number, or null if not stated> } ],
  "discount": <discount amount if mentioned, as a plain number, or null>,
  "amountPaid": <amount already paid or transferred if mentioned (a deposit or full payment), as a plain number, or null>,
  "paymentMethod": <one of "CASH", "CARD", "BANK_TRANSFER", "MOBILE_MONEY", "OTHER", or null if not mentioned>,
  "notes": <any other relevant context — delivery instructions, special requests — or null>
}

If this isn't an order conversation at all, or you genuinely cannot read it, reply with {"customerName": null, "customerPhone": null, "items": [], "discount": null, "amountPaid": null, "paymentMethod": null, "notes": null}.`;

const VALID_PAYMENT_METHODS = new Set(["CASH", "CARD", "BANK_TRANSFER", "MOBILE_MONEY", "OTHER"]);

function parseOrderExtraction(text: string): ExtractedOrder {
  const empty: ExtractedOrder = {
    customerName: null,
    customerPhone: null,
    items: [],
    discount: null,
    amountPaid: null,
    paymentMethod: null,
    notes: null,
  };
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
      items,
      discount: typeof parsed.discount === "number" ? parsed.discount : null,
      amountPaid: typeof parsed.amountPaid === "number" ? parsed.amountPaid : null,
      paymentMethod:
        typeof parsed.paymentMethod === "string" && VALID_PAYMENT_METHODS.has(parsed.paymentMethod)
          ? (parsed.paymentMethod as ExtractedOrder["paymentMethod"])
          : null,
      notes: typeof parsed.notes === "string" ? parsed.notes : null,
    };
  } catch {
    return empty;
  }
}

const EMPTY_ORDER: ExtractedOrder = {
  customerName: null,
  customerPhone: null,
  items: [],
  discount: null,
  amountPaid: null,
  paymentMethod: null,
  notes: null,
};

/** Extracts order fields from a WhatsApp order screenshot. Returns an empty order if AI isn't configured or extraction fails. */
export async function extractOrderFromImage(imageBuffer: Buffer, mediaType: string): Promise<ExtractedOrder> {
  const anthropic = ensureConfigured();
  if (!anthropic) return EMPTY_ORDER;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 600,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType as "image/jpeg", data: imageBuffer.toString("base64") },
            },
            { type: "text", text: ORDER_EXTRACTION_PROMPT },
          ],
        },
      ],
    });
    const text = response.content.find((b) => b.type === "text")?.text ?? "";
    return parseOrderExtraction(text);
  } catch (err) {
    console.error("AI order extraction failed:", err);
    return EMPTY_ORDER;
  }
}

/** Extracts order fields from pasted WhatsApp chat text. */
export async function extractOrderFromText(text: string): Promise<ExtractedOrder> {
  const anthropic = ensureConfigured();
  if (!anthropic) return EMPTY_ORDER;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5-5",
      max_tokens: 600,
      messages: [{ role: "user", content: `${ORDER_EXTRACTION_PROMPT}\n\nChat:\n${text}` }],
    });
    const content = response.content.find((b) => b.type === "text")?.text ?? "";
    return parseOrderExtraction(content);
  } catch (err) {
    console.error("AI order extraction failed:", err);
    return EMPTY_ORDER;
  }
}
