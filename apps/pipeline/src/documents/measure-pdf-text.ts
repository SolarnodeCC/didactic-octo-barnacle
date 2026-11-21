#!/usr/bin/env node
/**
 * Measures the peak memory and CPU time of text extraction on the fixture PDFs of ADR 0009,
 * to set `text.max_pdf_bytes` and `text.max_pages` (REQ-DATA-006). Each fixture runs in its
 * own Node process that reads it from a file written beforehand, so its peak resident memory
 * holds the extraction only, and a process that reads a file and loads unpdf without
 * extracting gives the baseline to subtract.
 *
 * Node is a stand-in for the Worker isolate (128 MB, ADR 0009): it shows how memory grows
 * with file size and page count. The staging run of WP4 checks the result in Workers.
 *
 * Usage: pnpm --filter @roi/pipeline measure:pdf-text
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  corruptPdf,
  largeLongPdf,
  largePdf,
  longPdf,
  scannedPdf,
  twoColumnPaperPdf,
} from "./fixture-pdfs.js";
import { extractPdfText, PdfTextError } from "./pdf-text.js";

const MIB = 1024 * 1024;

const FIXTURES: Record<string, () => Uint8Array> = {
  "two-column, 2 pages": () => twoColumnPaperPdf(2),
  scanned: scannedPdf,
  corrupt: corruptPdf,
  "long, 100 pages": () => longPdf(100),
  "long, 300 pages": () => longPdf(300),
  "large, 10 MiB": () => largePdf(10 * MIB),
  "large, 25 MiB": () => largePdf(25 * MIB),
  "large, 50 MiB": () => largePdf(50 * MIB),
  // At both proposed caps at once: the worst file the consumer accepts.
  "20 MiB and 100 pages": () => largeLongPdf(20 * MIB, 100),
};

/** No page or text limit applies while measuring. */
const NO_LIMITS = { MaxPages: Number.MAX_SAFE_INTEGER, MinChars: 1 };

type Measurement = {
  Fixture: string;
  Bytes: number;
  Outcome: string;
  Pages: number;
  TextChars: number;
  PeakRssMiB: number;
  CpuMs: number;
};

async function measureOne(name: string, path: string): Promise<Measurement> {
  const bytes = new Uint8Array(readFileSync(path));
  const size = bytes.byteLength;
  if (name === "baseline") {
    await import("unpdf");
    return result(name, size, "baseline", 0, 0, 0);
  }
  const cpu = process.cpuUsage();
  try {
    const text = await extractPdfText(bytes, NO_LIMITS);
    return result(name, size, "text", text.Pages, text.Text.length, elapsed(cpu));
  } catch (error) {
    const outcome = error instanceof PdfTextError ? error.Code : "error";
    return result(name, size, outcome, 0, 0, elapsed(cpu));
  }
}

function elapsed(start: NodeJS.CpuUsage): number {
  const used = process.cpuUsage(start);
  return Math.round((used.user + used.system) / 1000);
}

function result(
  fixture: string,
  bytes: number,
  outcome: string,
  pages: number,
  chars: number,
  cpuMs: number,
): Measurement {
  return {
    Fixture: fixture,
    Bytes: bytes,
    Outcome: outcome,
    Pages: pages,
    TextChars: chars,
    // maxRSS is in kibibytes.
    PeakRssMiB: Math.round((process.resourceUsage().maxRSS / 1024) * 10) / 10,
    CpuMs: cpuMs,
  };
}

function runChild(name: string, path: string): Measurement {
  const child = spawnSync(
    process.execPath,
    [...process.execArgv, fileURLToPath(import.meta.url), "--one", name, path],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  if (child.status !== 0) {
    throw new Error(`measuring ${name} failed: ${child.stderr}`);
  }
  return JSON.parse(child.stdout.trim().split("\n").at(-1) ?? "{}") as Measurement;
}

function table(rows: Measurement[], baseline: number): string {
  const lines = [
    "| Fixture | File (MiB) | Outcome | Pages | Text (chars) | Peak RSS above baseline (MiB) | CPU (ms) |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.Fixture} | ${(row.Bytes / MIB).toFixed(2)} | ${row.Outcome} | ${row.Pages} | ${row.TextChars.toLocaleString("en")} | ${(row.PeakRssMiB - baseline).toFixed(1)} | ${row.CpuMs} |`,
    );
  }
  return lines.join("\n");
}

const [flag, name, path] = process.argv.slice(2);
if (flag === "--one" && name && path) {
  console.log(JSON.stringify(await measureOne(name, path)));
} else {
  const dir = mkdtempSync(join(tmpdir(), "roi-pdf-text-"));
  try {
    const files = Object.entries(FIXTURES).map(([fixture, make], index) => {
      const file = join(dir, `${index}.pdf`);
      writeFileSync(file, make());
      return { Fixture: fixture, File: file };
    });
    // The baseline reads the smallest file, so it holds Node, unpdf, and almost no data.
    const baseline = runChild("baseline", files[0]?.File ?? "").PeakRssMiB;
    const rows = files.map((file) => runChild(file.Fixture, file.File));
    console.log(`Node ${process.version}, baseline peak RSS ${baseline} MiB\n`);
    console.log(table(rows, baseline));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
