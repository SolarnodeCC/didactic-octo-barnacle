import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  corruptPdf,
  largePdf,
  longPdf,
  scannedPdf,
  TWO_COLUMN_PHRASES,
  twoColumnPaperPdf,
} from "./fixture-pdfs.js";
import { extractPdfText, PDF_TEXT_EXTRACTOR, PdfTextError, UNPDF_VERSION } from "./pdf-text.js";

const LIMITS = { MaxPages: 100, MinChars: 200 };

async function failure(bytes: Uint8Array, limits = LIMITS): Promise<PdfTextError> {
  const error: unknown = await extractPdfText(bytes, limits).then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(PdfTextError);
  return error as PdfTextError;
}

describe("REQ-DATA-006: PDF text extraction with unpdf", () => {
  it("REQ-DATA-006: reads both columns and the equations of a two-column paper", async () => {
    const result = await extractPdfText(twoColumnPaperPdf(2), LIMITS);
    expect(result.Pages).toBe(2);
    for (const phrase of TWO_COLUMN_PHRASES) {
      expect(result.Text).toContain(phrase);
    }
    // The left column comes before the right one.
    expect(result.Text.indexOf(TWO_COLUMN_PHRASES[0])).toBeLessThan(
      result.Text.indexOf(TWO_COLUMN_PHRASES[2]),
    );
  });

  it("REQ-DATA-006: reads a large file whose size is mostly an image", async () => {
    const result = await extractPdfText(largePdf(2 * 1024 * 1024), LIMITS);
    expect(result.Pages).toBe(3);
    expect(result.Text).toContain(TWO_COLUMN_PHRASES[3]);
  });

  it("REQ-DATA-006: refuses a file over the page limit before reading its pages", async () => {
    const error = await failure(longPdf(5), { MaxPages: 4, MinChars: 1 });
    expect(error.Code).toBe("too-many-pages");
    expect(error.message).toContain("5 pages");
  });

  it("REQ-DATA-006: a scanned page with no text layer fails as no-text", async () => {
    expect((await failure(scannedPdf())).Code).toBe("no-text");
  });

  it("REQ-DATA-006: a corrupt file fails as unreadable, with no bytes of the file in the reason", async () => {
    const error = await failure(corruptPdf());
    expect(error.Code).toBe("unreadable");
    expect(error.message).not.toMatch(/obj|stream|Helvetica/);
  });

  it("REQ-DATA-006: text below the minimum counts as no text layer", async () => {
    expect((await failure(twoColumnPaperPdf(1), { MaxPages: 100, MinChars: 100_000 })).Code).toBe(
      "no-text",
    );
  });

  it("REQ-DATA-006: the stored extractor version is the installed unpdf release", () => {
    const require = createRequire(import.meta.url);
    // The package exports no `package.json`, so it is read next to the entry file.
    const entry = require.resolve("unpdf");
    const installed = JSON.parse(
      readFileSync(join(dirname(entry), "..", "package.json"), "utf8"),
    ) as { version: string };
    expect(UNPDF_VERSION).toBe(installed.version);
    expect(PDF_TEXT_EXTRACTOR).toBe(`unpdf@${installed.version}`);
  });
});
