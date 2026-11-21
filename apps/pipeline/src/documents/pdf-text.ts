import { getDocumentProxy } from "unpdf";

/**
 * The unpdf release the pipeline is locked to (`apps/pipeline/package.json`). A unit test
 * checks the two agree, so the stored extractor version is always the one that ran.
 */
export const UNPDF_VERSION = "2.2.1";

/** Extractor name and version stored with every extracted text (REQ-DATA-006 AC1, ADR 0009). */
export const PDF_TEXT_EXTRACTOR = `unpdf@${UNPDF_VERSION}`;

export type PdfTextLimits = {
  /** `text.max_pages`: a longer file is refused before any page is read (ADR 0009). */
  MaxPages: number;
  /**
   * `text.min_chars`: less text than this (not counting white space) means the file has no
   * usable text layer, as with a scanned paper, which the MVP does not read (ADR 0009).
   */
  MinChars: number;
};

export type PdfTextFailure = "too-many-pages" | "unreadable" | "no-text";

/** A file that cannot give usable text. It never passes on a retry, so it is not retried. */
export class PdfTextError extends Error {
  constructor(
    readonly Code: PdfTextFailure,
    message: string,
  ) {
    super(message);
    this.name = "PdfTextError";
  }
}

export type ExtractedPdfText = { Text: string; Pages: number };

export type PdfTextExtractor = (
  bytes: Uint8Array,
  limits: PdfTextLimits,
) => Promise<ExtractedPdfText>;

type TextItem = { str?: string; hasEOL?: boolean };

/**
 * Extracts the text layer of a PDF with unpdf (ADR 0009). It reads one page at a time and
 * releases each page before the next, so memory grows with the text and not with the
 * number of pages held open. A file that does not parse, has more pages than the limit, or
 * has no text layer throws a `PdfTextError`; the caller marks the document failed and the
 * publication keeps its abstract (REQ-DATA-006 AC2). The bytes are handed over: the caller
 * must not read them afterwards.
 */
export const extractPdfText: PdfTextExtractor = async (bytes, limits) => {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // No copy: pdf.js may take over the buffer, and the caller does not use it again.
    pdf = await getDocumentProxy(bytes, {
      useSystemFonts: false,
      // Errors only: pdf.js warnings about fonts would fill the Worker log.
      verbosity: 0,
    });
  } catch (error) {
    throw new PdfTextError("unreadable", `not a readable PDF: ${errorName(error)}`);
  }
  try {
    if (pdf.numPages > limits.MaxPages) {
      throw new PdfTextError(
        "too-many-pages",
        `${pdf.numPages} pages, more than the limit of ${limits.MaxPages}`,
      );
    }
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      pages.push(await pageText(pdf, number));
    }
    const text = pages.join("\n\n").trim();
    const characters = text.replace(/\s+/g, "").length;
    if (characters < limits.MinChars) {
      throw new PdfTextError(
        "no-text",
        `${characters} characters of text, fewer than ${limits.MinChars}: no usable text layer`,
      );
    }
    return { Text: text, Pages: pdf.numPages };
  } catch (error) {
    if (error instanceof PdfTextError) {
      throw error;
    }
    throw new PdfTextError("unreadable", `the PDF could not be read: ${errorName(error)}`);
  } finally {
    // Frees the parsed document and its worker state before the next message.
    await pdf.loadingTask.destroy();
  }
};

async function pageText(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
  number: number,
): Promise<string> {
  const page = await pdf.getPage(number);
  try {
    const content = await page.getTextContent();
    return (content.items as TextItem[])
      .map((item) => (item.str ?? "") + (item.hasEOL ? "\n" : ""))
      .join("");
  } finally {
    page.cleanup();
  }
}

/** The error's class name only: a parser message can quote bytes of the file. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "unknown error";
}
