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
