/**
 * PDF files written by the code itself, for the tests and the memory measurement
 * (`measure-pdf-text.ts`), so the fixtures of ADR 0009 need no third-party
 * file and carry this repository's license: a paper in two columns with equations, a long
 * file, a scanned page with no text layer, and a corrupt file (REQ-DATA-006, REQ-DATA-010).
 * The writer covers only what these fixtures need: Helvetica text and one grey image.
 */

type Page = { Content: string; Image: boolean };

/** Bytes of the grey image; a large value makes a large file whose text stays small. */
type Options = { ImageBytes?: number };

/** Escapes a line for a PDF string literal; the fixtures use ASCII text only. */
function literal(line: string): string {
  return `(${line.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
}

/** A text block of lines at a position, 12 points apart. */
function block(x: number, y: number, lines: readonly string[]): string {
  const body = lines.map((line, index) => `${index === 0 ? "" : "T* "}${literal(line)} Tj`);
  return `BT /F1 10 Tf 12 TL ${x} ${y} Td ${body.join(" ")} ET`;
}

/** Writes the objects, the cross-reference table, and the trailer. */
function assemble(pages: readonly Page[], options: Options = {}): Uint8Array {
  const objects: string[] = [];
  const add = (body: string): number => objects.push(body);

  const catalog = add("");
  const pagesRoot = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const side = Math.max(8, Math.ceil(Math.sqrt(options.ImageBytes ?? 64)));
  const pixels = "\x80".repeat(side * side);
  const image = add(
    `<< /Type /XObject /Subtype /Image /Width ${side} /Height ${side} /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${pixels.length} >>\nstream\n${pixels}\nendstream`,
  );
  const kids: number[] = [];
  for (const page of pages) {
    const content = add(`<< /Length ${page.Content.length} >>\nstream\n${page.Content}\nendstream`);
    const resources = page.Image
      ? `<< /XObject << /Im1 ${image} 0 R >> >>`
      : `<< /Font << /F1 ${font} 0 R >> >>`;
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents ${content} 0 R >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesRoot} 0 R >>`;
  objects[pagesRoot - 1] =
    `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  // Latin-1 keeps one byte per character, so string lengths are byte offsets.
  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (char) => char.charCodeAt(0));
}

const LEFT = [
  "Abstract. Regional hospitals lose 12 percent of",
  "scheduled theatre time to late cancellations.",
  "We model the cancellation rate as",
  "r(t) = a * exp(-b * t) + c, with a, b, c > 0,",
  "and fit it on 4,812 operations.",
];
const RIGHT = [
  "The loss per hospital is L = sum_i (d_i * w_i),",
  "where d_i is the idle time of theatre i and",
  "w_i its hourly cost in EUR.",
  "Planners now rebuild the schedule by hand",
  "each morning, which takes about two hours.",
];

/**
 * A paper in two columns with equations: what most fixtures look like. `pages` repeats the
 * page, numbered, to make a longer file.
 */
export function twoColumnPaperPdf(pages = 2): Uint8Array {
  return assemble(twoColumnPages(pages));
}

function twoColumnPages(pages: number): Page[] {
  return Array.from({ length: pages }, (_, index) => ({
    Content: [
      block(50, 740, [`Page ${index + 1}`]),
      block(50, 700, LEFT),
      block(320, 700, RIGHT),
    ].join("\n"),
    Image: false,
  }));
}

/** A long file of `pages` pages, each with `linesPerPage` lines of text. */
export function longPdf(pages: number, linesPerPage = 50): Uint8Array {
  return assemble(longPages(pages, linesPerPage));
}

function longPages(pages: number, linesPerPage: number): Page[] {
  const line = (page: number, row: number) =>
    `Page ${page} line ${row}: theatre schedules, cancellations, idle time, and cost per hour.`;
  return Array.from({ length: pages }, (_, page) => ({
    Content: block(
      40,
      760,
      Array.from({ length: linesPerPage }, (_, row) => line(page + 1, row + 1)),
    ),
    Image: false,
  }));
}

const IMAGE_PAGE: Page = { Content: "q 500 0 0 700 50 50 cm /Im1 Do Q", Image: true };

/** A scanned page: one image and no text layer. */
export function scannedPdf(): Uint8Array {
  return assemble([IMAGE_PAGE]);
}

/**
 * A large file whose size is mostly one image, as with a paper full of figures: two text
 * pages and a page that shows an image of about `imageBytes` bytes.
 */
export function largePdf(imageBytes: number): Uint8Array {
  const text = twoColumnPages(2);
  return assemble([...text, IMAGE_PAGE], { ImageBytes: imageBytes });
}

/** A large file with many text pages: `pages` text pages and one image of `imageBytes`. */
export function largeLongPdf(imageBytes: number, pages: number): Uint8Array {
  return assemble([...longPages(pages, 50), IMAGE_PAGE], { ImageBytes: imageBytes });
}

/** A file that starts like a PDF and then breaks off. */
export function corruptPdf(): Uint8Array {
  const whole = twoColumnPaperPdf(1);
  return whole.slice(0, Math.floor(whole.length / 3));
}

/** Text that the two-column fixture holds, to check extraction against. */
export const TWO_COLUMN_PHRASES = [
  "Regional hospitals lose 12 percent",
  "r(t) = a * exp(-b * t) + c",
  "L = sum_i (d_i * w_i)",
  "Planners now rebuild the schedule by hand",
] as const;
