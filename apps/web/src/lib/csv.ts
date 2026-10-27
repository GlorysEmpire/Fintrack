/**
 * CSV for the data export.
 *
 * Two things matter beyond commas and quotes:
 *  - A cell that starts with = + - @ (or a tab / carriage return) is read by
 *    Excel and Sheets as a FORMULA, so a transaction note like =HYPERLINK(...)
 *    would run when the user opens their own export. Such text is prefixed with
 *    an apostrophe so it stays text. Real numbers are written as numbers and are
 *    never altered (a negative amount must stay -500.00).
 *  - Money is written as plain decimals with two places, never rounded to whole
 *    units and never with a currency symbol or thousands separators.
 */

export type CsvCell = string | number | boolean | null | undefined | Date;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One header row, then the rows. Lines end with CRLF, as spreadsheets expect. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** A money amount as a plain two-decimal number (minor units in) */
export function minorToDecimal(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minor));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** A stored major-unit amount as a two-decimal string */
export function majorToDecimal(amount: number): string {
  return minorToDecimal(Math.round(amount * 100));
}
