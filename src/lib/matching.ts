import "server-only";

/** Loose text match: lowercased, punctuation stripped to spaces, trimmed — for fuzzy name/item comparisons. */
export function normalize(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Strips everything but digits from a phone number, for comparing the last few digits regardless of country code/formatting. */
export function normalizePhone(s: string) {
  return s.replace(/\D/g, "");
}
