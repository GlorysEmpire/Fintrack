import { describe, expect, it } from "vitest";
import { csvCell, majorToDecimal, minorToDecimal, toCsv } from "./csv";

describe("csvCell", () => {
  it("quotes commas, quotes and line breaks, and doubles inner quotes", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("keeps spreadsheet formulas from running when the user opens their own export", () => {
    for (const evil of ["=HYPERLINK(\"http://x\",\"y\")", "+1+1", "-2+3", "@SUM(A1)", "\t=1", "\r=1"]) {
      expect(csvCell(evil).replace(/^"/, "").startsWith("'")).toBe(true);
    }
    expect(csvCell("=1+1")).toBe("'=1+1");
  });

  it("never alters a real number, so a negative amount stays negative", () => {
    expect(csvCell(-500.25)).toBe("-500.25");
    expect(csvCell(0)).toBe("0");
  });

  it("writes empty for missing values, booleans and dates plainly", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(true)).toBe("true");
    expect(csvCell(new Date("2026-10-27T10:00:00Z"))).toBe("2026-10-27T10:00:00.000Z");
    expect(csvCell(Number.NaN)).toBe("");
  });
});

describe("toCsv", () => {
  it("writes a header then rows, CRLF terminated", () => {
    expect(toCsv(["a", "b"], [["1", "x,y"], [2, null]])).toBe('a,b\r\n1,"x,y"\r\n2,\r\n');
  });
});

describe("money as decimals", () => {
  it("minor units become exact two-place decimals, with the sign", () => {
    expect(minorToDecimal(123456)).toBe("1234.56");
    expect(minorToDecimal(5)).toBe("0.05");
    expect(minorToDecimal(-1050)).toBe("-10.50");
    expect(minorToDecimal(0)).toBe("0.00");
  });
  it("major amounts keep their kobo", () => {
    expect(majorToDecimal(2500)).toBe("2500.00");
    expect(majorToDecimal(1250.5)).toBe("1250.50");
    expect(majorToDecimal(0.1 + 0.2)).toBe("0.30");
  });
});
