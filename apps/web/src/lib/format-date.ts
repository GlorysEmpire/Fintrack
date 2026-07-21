/**
 * Deterministic date formatting for SSR + client hydration.
 *
 * Do NOT use toLocaleString / toLocaleDateString without a fixed timeZone —
 * Node and the browser can disagree on separators ("18 Jul at 15:47" vs
 * "18 Jul, 15:47") and on local timezone.
 *
 * FinTrack is Nigeria-first → always format in Africa/Lagos.
 */

const TZ = "Africa/Lagos";

function partsOf(d: Date, options: Intl.DateTimeFormatOptions) {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...options });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return map;
}

/** e.g. "18 Jul, 15:47" — transaction / inbox lists */
export function formatTxDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return "";
  const p = partsOf(d, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // en-GB hour can be "15" or "15" with hourCycle; normalize
  const hour = (p.hour || "00").padStart(2, "0");
  const minute = (p.minute || "00").padStart(2, "0");
  return `${p.day} ${p.month}, ${hour}:${minute}`;
}

/** e.g. "Saturday, 18 July 2026" — top bar */
export function formatLongDate(input: Date = new Date()): string {
  if (Number.isNaN(input.getTime())) return "";
  const p = partsOf(input, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
}
