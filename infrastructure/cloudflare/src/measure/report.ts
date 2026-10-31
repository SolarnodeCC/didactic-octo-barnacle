import { estimateCost, type CostAssumptions, type CostEstimate } from "./estimate.js";
import { MEASUREMENT_QUERIES, type MeasurementName } from "./queries.js";

export type Row = Record<string, unknown>;
export type Measurements = Record<MeasurementName, Row[]>;

/** Runs every query through `execute`, which returns the rows of one statement. */
export async function collectMeasurements(
  execute: (sql: string) => Promise<Row[]>,
): Promise<Measurements> {
  const result = {} as Measurements;
  for (const query of MEASUREMENT_QUERIES) {
    result[query.Name] = await execute(query.Sql);
  }
  return result;
}

const num = (value: unknown): number => (typeof value === "number" ? value : 0);
const text = (value: unknown): string => (typeof value === "string" ? value : "");

export type SourceVolume = {
  Source: string;
  Days: number;
  Total: number;
  MeanPerDay: number | null;
  MinPerDay: number | null;
  MaxPerDay: number | null;
};

export type SourceQuality = {
  Source: string;
  Publications: number;
  WithAbstract: number;
  Complete: number;
  StorablePdf: number;
  AvgAbstractChars: number | null;
};

type RunTotals = { Total: number; Succeeded: number; Partial: number; Failed: number };

export type Phase1Report = {
  GeneratedAt: string;
  Overview: {
    Publications: number;
    FirstStoredAt: string | null;
    LastStoredAt: string | null;
    DuplicatesFlagged: number;
    RunsStoppedByPageCap: number;
    Alerts: number;
    Erasures: number;
  };
  Runs: RunTotals;
  Volume: SourceVolume[];
  /** Sum over sources: a publication found in both sources counts twice, so an upper bound. */
  PublicationsPerDay: number | null;
  Quality: SourceQuality[];
  DocumentsByLicense: Array<{ License: string; Documents: number }>;
  DocumentMessages: Array<{ Status: string; Reason: string; Messages: number }>;
  DeadLetters: number;
  Estimate: CostEstimate;
  /** Phase 1 exit criteria that the data can answer (docs/kt/roadmap.md). */
  Checks: Array<{ Name: string; Met: boolean }>;
};

function volume(rows: Row[]): SourceVolume[] {
  const bySource = new Map<string, number[]>();
  for (const row of rows) {
    bySource.set(text(row["source"]), [
      ...(bySource.get(text(row["source"])) ?? []),
      num(row["publications"]),
    ]);
  }
  return [...bySource.entries()].sort().map(([source, counts]) => {
    const total = counts.reduce((sum, n) => sum + n, 0);
    return {
      Source: source,
      Days: counts.length,
      Total: total,
      MeanPerDay: counts.length > 0 ? total / counts.length : null,
      MinPerDay: counts.length > 0 ? Math.min(...counts) : null,
      MaxPerDay: counts.length > 0 ? Math.max(...counts) : null,
    };
  });
}

export function buildReport(
  data: Measurements,
  assumptions: CostAssumptions,
  generatedAt: string,
): Phase1Report {
  const overview = data.overview[0] ?? {};
  const runs = data.runs_per_day.reduce<RunTotals>(
    (sum, row) => ({
      Total: sum.Total + num(row["runs"]),
      Succeeded: sum.Succeeded + num(row["succeeded"]),
      Partial: sum.Partial + num(row["partial"]),
      Failed: sum.Failed + num(row["failed"]),
    }),
    { Total: 0, Succeeded: 0, Partial: 0, Failed: 0 },
  );
  const perDay = volume(data.publications_per_publication_day);
  const publicationDays = new Map<string, number>();
  for (const row of data.publications_per_publication_day) {
    publicationDays.set(
      text(row["day"]),
      (publicationDays.get(text(row["day"])) ?? 0) + num(row["publications"]),
    );
  }
  const publicationsPerDay =
    publicationDays.size > 0
      ? [...publicationDays.values()].reduce((sum, n) => sum + n, 0) / publicationDays.size
      : null;

  const quality = data.quality_by_source.map((row) => ({
    Source: text(row["source"]),
    Publications: num(row["publications"]),
    WithAbstract: num(row["with_abstract"]),
    Complete: num(row["complete"]),
    StorablePdf: num(row["storable_pdf"]),
    AvgAbstractChars:
      typeof row["avg_abstract_chars"] === "number" ? row["avg_abstract_chars"] : null,
  }));
  const withAbstract = quality.reduce((sum, q) => sum + q.WithAbstract, 0);
  const avgAbstractChars =
    withAbstract > 0
      ? quality.reduce((sum, q) => sum + (q.AvgAbstractChars ?? 0) * q.WithAbstract, 0) /
        withAbstract
      : null;

  const deadLetters = data.dead_letters.reduce((sum, row) => sum + num(row["messages"]), 0);
  const estimate = estimateCost(assumptions, {
    AvgAbstractChars: avgAbstractChars,
    PublicationsPerDay: publicationsPerDay,
  });

  return {
    GeneratedAt: generatedAt,
    Overview: {
      Publications: num(overview["publications"]),
      FirstStoredAt: text(overview["first_stored_at"]) || null,
      LastStoredAt: text(overview["last_stored_at"]) || null,
      DuplicatesFlagged: num(overview["duplicates_flagged"]),
      RunsStoppedByPageCap: num(overview["runs_stopped_by_page_cap"]),
      Alerts: num(overview["alerts"]),
      Erasures: num(overview["erasures"]),
    },
    Runs: runs,
    Volume: perDay,
    PublicationsPerDay: publicationsPerDay,
    Quality: quality,
    DocumentsByLicense: data.documents_by_license.map((row) => ({
      License: text(row["license"]),
      Documents: num(row["documents"]),
    })),
    DocumentMessages: data.document_messages.map((row) => ({
      Status: text(row["status"]),
      Reason: text(row["reason"]),
      Messages: num(row["messages"]),
    })),
    DeadLetters: deadLetters,
    Estimate: estimate,
    Checks: [
      {
        Name: "A scheduled run ingested publications from both sources",
        Met: perDay.length >= 2 && runs.Succeeded > 0,
      },
      {
        Name: "No run ended failed and no message was dead-lettered",
        Met: runs.Failed === 0 && deadLetters === 0,
      },
      { Name: "Daily volume per source is measured", Met: publicationsPerDay !== null },
      {
        Name: "The cost per publication estimate is complete (prices filled in)",
        Met: estimate.Complete,
      },
    ],
  };
}

const pct = (part: number, whole: number): string =>
  whole === 0 ? "n/a" : `${((part / whole) * 100).toFixed(1)} %`;
const fixed = (value: number | null, digits = 1): string =>
  value === null ? "n/a" : value.toFixed(digits);
const eur = (value: number | null): string => (value === null ? "n/a" : `EUR ${value.toFixed(4)}`);

export function formatMarkdown(report: Phase1Report): string {
  const lines: string[] = [
    "# Phase 1 measurements (staging)",
    "",
    `Generated at ${report.GeneratedAt}. Publications stored: ${report.Overview.Publications}` +
      (report.Overview.FirstStoredAt
        ? ` (${report.Overview.FirstStoredAt} to ${report.Overview.LastStoredAt}).`
        : "."),
    "",
    "## Volume per source (by publication date)",
    "",
    "| Source | Days | Total | Mean per day | Min | Max |",
    "|---|---|---|---|---|---|",
    ...report.Volume.map(
      (v) =>
        `| ${v.Source} | ${v.Days} | ${v.Total} | ${fixed(v.MeanPerDay)} | ${v.MinPerDay ?? "n/a"} | ${v.MaxPerDay ?? "n/a"} |`,
    ),
    "",
    `Publications per day over both sources: ${fixed(report.PublicationsPerDay)} (an upper bound: a publication found in both sources counts twice).` +
      (report.Overview.RunsStoppedByPageCap > 0
        ? ` **${report.Overview.RunsStoppedByPageCap} run(s) stopped at the page cap, so these counts are lower bounds.**`
        : ""),
    "",
    `Runs: ${report.Runs.Total} (${report.Runs.Succeeded} succeeded, ${report.Runs.Partial} partial, ${report.Runs.Failed} failed). Dead-lettered messages: ${report.DeadLetters}. Alerts raised: ${report.Overview.Alerts}.`,
    "",
    "## Data quality",
    "",
    "| Source | Publications | With abstract | Complete | Storable PDF | Mean abstract length |",
    "|---|---|---|---|---|---|",
    ...report.Quality.map(
      (q) =>
        `| ${q.Source} | ${q.Publications} | ${pct(q.WithAbstract, q.Publications)} | ${pct(q.Complete, q.Publications)} | ${pct(q.StorablePdf, q.Publications)} | ${fixed(q.AvgAbstractChars, 0)} characters |`,
    ),
    "",
    `Duplicates flagged for review (title and first author): ${report.Overview.DuplicatesFlagged}.`,
    "",
    "Stored PDFs by license: " +
      (report.DocumentsByLicense.length > 0
        ? report.DocumentsByLicense.map((d) => `${d.License} ${d.Documents}`).join(", ")
        : "none") +
      ".",
    "",
    "PDF messages: " +
      (report.DocumentMessages.length > 0
        ? report.DocumentMessages.map((m) => `${m.Status}/${m.Reason} ${m.Messages}`).join(", ")
        : "none") +
      ".",
    "",
    "## Cost per publication (ESTIMATE, ADR 0032)",
    "",
    `Mean abstract: ${fixed(report.Estimate.AvgAbstractTokens, 0)} tokens. Triage input ${fixed(report.Estimate.Triage.InputTokens, 0)} tokens, extraction input ${fixed(report.Estimate.Extraction.InputTokens, 0)} tokens.`,
    "",
    `- Triage per publication: ${eur(report.Estimate.Triage.Eur)}`,
    `- Extraction per publication: ${eur(report.Estimate.Extraction.Eur)}`,
    `- **Per publication (triage plus extraction): ${eur(report.Estimate.PerPublicationEur)}**`,
    `- Upper bound per day (all triaged, at most the daily limit extracted): ${eur(report.Estimate.DailyUpperBoundEur)}`,
    `- Provisional phase 2 budget (OQ-013, daily limit × cost × 1.5): ${eur(report.Estimate.ProvisionalPhase2BudgetEur)}`,
    ...(report.Estimate.Complete
      ? []
      : [
          "",
          `**Incomplete:** missing ${report.Estimate.Missing.join(", ")}. Fill in the prices in \`measure/cost-assumptions.json\`.`,
        ]),
    "",
    "## Phase 1 exit criteria the data can answer",
    "",
    ...report.Checks.map((c) => `- [${c.Met ? "x" : " "}] ${c.Name}`),
    "",
  ];
  return lines.join("\n");
}
