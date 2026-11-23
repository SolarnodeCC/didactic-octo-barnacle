import {
  customerQuoteOverlaps,
  normalisedCustomer,
  QualitySectionSchema,
  type QualityMetric,
  type QualitySection,
} from "@roi/models";

import { notify } from "../alerts/notify.js";
import { industriesForTopics } from "../normalize/scope.js";
import { type PipelineDeps } from "../queue/deps.js";
import { registryIndexes } from "../store/embedding-index-repo.js";
import { type SqlDatabase } from "../store/sql.js";

/** A rate of the day before it is compared with its baseline. */
type Rate = { Metric: string; Value: number; Items: number };

/** The triage signals, by column, as they are named in the quality section. */
const SIGNALS = [
  ["signal_named_party", "named_party"],
  ["signal_stated_harm", "stated_harm"],
  ["signal_trigger", "trigger"],
  ["signal_existing_alternative", "existing_alternative"],
  ["signal_adoptable", "adoptable"],
] as const;

/** Most publications whose neighbours are looked up for near-duplicates in one report. */
const NEAR_DUPLICATE_PUBLICATIONS = 100;
const NEAR_DUPLICATE_TOP_K = 10;

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function rate(metric: string, numerator: number, items: number): Rate | null {
  return items > 0 ? { Metric: metric, Value: round(numerator / items), Items: items } : null;
}

function dayOffset(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function triageRates(db: SqlDatabase, runId: string): Promise<Rate[]> {
  const sums = SIGNALS.map(([column]) => `COALESCE(SUM(${column}), 0) AS ${column}`).join(", ");
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(accepted), 0) AS accepted, ${sums}
       FROM triage_decision WHERE run_id = ? AND model IS NOT NULL`,
    )
    .bind(runId)
    .first<Record<string, number>>();
  const n = row?.n ?? 0;
  return [
    rate("triage.accept_rate", row?.accepted ?? 0, n),
    ...SIGNALS.map(([column, name]) => rate(`triage.signal.${name}`, row?.[column] ?? 0, n)),
  ].filter((item): item is Rate => item !== null);
}

async function modelCallRates(db: SqlDatabase, runId: string): Promise<Rate[]> {
  const { results } = await db
    .prepare(
      `SELECT step_name,
              COALESCE(SUM(attempt = 1), 0) AS first,
              COALESCE(SUM(attempt = 1 AND outcome = 'ok'), 0) AS first_ok,
              COALESCE(SUM(attempt > 1 AND outcome = 'ok'), 0) AS repaired
       FROM model_call
       WHERE run_kind = 'processing' AND run_id = ? AND step_name IN ('triage', 'extraction')
       GROUP BY step_name ORDER BY step_name`,
    )
    .bind(runId)
    .all<{ step_name: string; first: number; first_ok: number; repaired: number }>();
  return results.flatMap((row) =>
    [
      rate(`${row.step_name}.first_attempt_valid`, row.first_ok, row.first),
      rate(`${row.step_name}.repair_rate`, row.repaired, row.first),
    ].filter((item): item is Rate => item !== null),
  );
}

type ExtractionRow = {
  publication_id: string;
  input_mode: string;
  confidence: number;
  candidate_count: number;
  quote_positions_json: string;
  topics_json: string;
  accepted: number | null;
};

type CandidateRow = {
  publication_id: string;
  customer: string;
  customer_quote: string;
  why_now_quote: string | null;
  alternative_quote: string | null;
  signal_trigger: number | null;
  signal_existing_alternative: number | null;
};

/**
 * Possible near-duplicate opportunities (REQ-NFR-023 AC2): pairs of candidates whose
 * publications are nearest neighbours at a cosine of at least `monitor.near_duplicate_cosine`
 * in the current index and that share a normalised `Customer`. It reads stored vectors only,
 * so it makes no embedding call. Null when no vector index is bound.
 */
async function nearDuplicates(
  deps: PipelineDeps,
  candidates: CandidateRow[],
  cosine: number,
): Promise<number | null> {
  const embedding = deps.Embedding;
  if (!embedding) {
    return null;
  }
  const current = (await registryIndexes(deps.Db, embedding.Environment)).find(
    (entry) => entry.Current,
  );
  const index = current ? embedding.Indexes[current.Binding] : undefined;
  if (!index) {
    return null;
  }
  const customersOf = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const set = customersOf.get(candidate.publication_id) ?? new Set<string>();
    set.add(normalisedCustomer(candidate.customer));
    customersOf.set(candidate.publication_id, set);
  }
  const pairs = new Set<string>();
  for (const [publicationId, customers] of [...customersOf].slice(0, NEAR_DUPLICATE_PUBLICATIONS)) {
    const [stored] = await index.getByIds([publicationId]);
    if (!stored) {
      continue;
    }
    const { matches } = await index.query(Array.from(stored.values), {
      topK: NEAR_DUPLICATE_TOP_K,
      returnMetadata: "none",
    });
    for (const match of matches) {
      if (match.id === publicationId || match.score < cosine) {
        continue;
      }
      const { results } = await deps.Db.prepare(
        "SELECT customer FROM candidate WHERE publication_id = ? AND hidden_reason IS NULL",
      )
        .bind(match.id)
        .all<{ customer: string }>();
      if (results.some((row) => customers.has(normalisedCustomer(row.customer)))) {
        pairs.add([publicationId, match.id].sort().join("|"));
      }
    }
  }
  return pairs.size;
}

/**
 * The quality rates and histograms of one daily run, from stored rows only (REQ-NFR-023 AC1,
 * ADR 0071). Each rate carries the items behind it; a rate with no items is left out.
 */
export async function qualityRates(
  deps: PipelineDeps,
  runId: string,
  counts: Record<string, number>,
  nearDuplicateCosine: number,
): Promise<Omit<QualitySection, "Metrics" | "StartUp"> & { Rates: Rate[] }> {
  const db = deps.Db;
  const extractions = (
    await db
      .prepare(
        `SELECT e.publication_id, e.input_mode, e.confidence, e.candidate_count,
                e.quote_positions_json, p.topics_json, t.accepted
         FROM extraction_result e
         JOIN publication p ON p.id = e.publication_id
         LEFT JOIN triage_decision t ON t.publication_id = e.publication_id
         WHERE e.run_id = ?`,
      )
      .bind(runId)
      .all<ExtractionRow>()
  ).results;
  const candidates = (
    await db
      .prepare(
        `SELECT c.publication_id, c.customer, c.customer_quote, c.why_now_quote,
                c.alternative_quote, t.signal_trigger, t.signal_existing_alternative
         FROM candidate c
         JOIN extraction_result e ON e.id = c.extraction_result_id
         LEFT JOIN triage_decision t ON t.publication_id = c.publication_id
         WHERE e.run_id = ? AND c.hidden_reason IS NULL`,
      )
      .bind(runId)
      .all<CandidateRow>()
  ).results;

  const n = extractions.length;
  const stored = counts.CandidatesStored ?? 0;
  const dropped = counts.CandidatesDropped ?? 0;
  const accepted = extractions.filter((row) => row.accepted === 1);
  const withTrigger = candidates.filter((row) => row.signal_trigger === 1);
  const withAlternative = candidates.filter((row) => row.signal_existing_alternative === 1);

  const rates = [
    ...(await triageRates(db, runId)),
    rate(
      "extraction.empty_share",
      extractions.filter((row) => row.candidate_count === 0).length,
      n,
    ),
    rate(
      "extraction.candidates_per_publication",
      extractions.reduce((sum, row) => sum + row.candidate_count, 0),
      n,
    ),
    rate(
      "extraction.abstract_only_share",
      extractions.filter((row) => row.input_mode === "abstract").length,
      n,
    ),
    ...(await modelCallRates(db, runId)),
    rate("extraction.drop_rate", dropped, stored + dropped),
    rate("extraction.quote_drop_rate", counts.DroppedQuote ?? 0, stored + dropped),
    // The report-only check of ADR 0066.
    rate(
      "extraction.customer_quote_no_overlap",
      candidates.filter((row) => !customerQuoteOverlaps(row.customer, row.customer_quote)).length,
      candidates.length,
    ),
    rate(
      "agreement.accepted_without_candidate",
      accepted.filter((row) => row.candidate_count === 0).length,
      accepted.length,
    ),
    rate(
      "agreement.trigger_with_why_now",
      withTrigger.filter((row) => row.why_now_quote !== null).length,
      withTrigger.length,
    ),
    rate(
      "agreement.existing_alternative_with_quote",
      withAlternative.filter((row) => row.alternative_quote !== null).length,
      withAlternative.length,
    ),
  ].filter((item): item is Rate => item !== null);

  const confidence = Array.from({ length: 10 }, () => 0);
  const positions = Array.from({ length: 10 }, () => 0);
  const industries: Record<string, number> = {};
  for (const row of extractions) {
    const tenth = Math.min(9, Math.floor(row.confidence * 10));
    confidence[tenth] = (confidence[tenth] ?? 0) + 1;
    const stored = JSON.parse(row.quote_positions_json) as number[];
    stored.forEach((count, i) => {
      if (i < 10) {
        positions[i] = (positions[i] ?? 0) + count;
      }
    });
    const topics = JSON.parse(row.topics_json) as string[];
    for (const industry of industriesForTopics({
      OpenAlexNames: topics,
      ArxivCategories: topics,
    })) {
      industries[industry] = (industries[industry] ?? 0) + 1;
    }
  }

  return {
    Rates: rates,
    ConfidenceHistogram: confidence,
    QuotePositions: positions,
    Industries: industries,
    NearDuplicates: await nearDuplicates(deps, candidates, nearDuplicateCosine),
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/**
 * The quality section of a daily run (REQ-NFR-023, ADR 0071). Each rate is stored for its day
 * and compared with its median over the previous `monitor.baseline_days`. A relative move of
 * more than `monitor.drift_band`, on at least `monitor.min_daily_items` items, is a drift and
 * raises one `quality-drift` alert per metric and day (REQ-NFR-019). A median of 0 is reported
 * without alerting, because a relative move from 0 is undefined. During the first
 * `monitor.baseline_days` after processing starts, nothing alerts (AC4).
 */
export async function qualitySection(
  deps: PipelineDeps,
  run: { RunId: string; Day: string; Counts: Record<string, number> },
): Promise<QualitySection | null> {
  const monitor = deps.Monitor;
  if (!monitor) {
    return null;
  }
  const db = deps.Db;
  const { Rates, ...rest } = await qualityRates(
    deps,
    run.RunId,
    run.Counts,
    monitor.NearDuplicateCosine,
  );
  const first = await db
    .prepare("SELECT MIN(day) AS day FROM processing_run WHERE kind = 'daily'")
    .first<{ day: string | null }>();
  const startUp =
    first?.day === null ||
    first?.day === undefined ||
    run.Day < dayOffset(first.day, monitor.BaselineDays);
  const from = dayOffset(run.Day, -monitor.BaselineDays);

  const metrics: QualityMetric[] = [];
  for (const item of Rates) {
    const { results } = await db
      .prepare(
        "SELECT value FROM quality_metric WHERE metric = ? AND day >= ? AND day < ? ORDER BY day",
      )
      .bind(item.Metric, from, run.Day)
      .all<{ value: number }>();
    const baseline = median(results.map((row) => row.value));
    const drift =
      !startUp &&
      baseline !== null &&
      baseline > 0 &&
      item.Items >= monitor.MinDailyItems &&
      Math.abs(item.Value - baseline) / baseline > monitor.DriftBand;
    metrics.push({
      Metric: item.Metric,
      Value: item.Value,
      Items: item.Items,
      Baseline: baseline === null ? null : round(baseline),
      Drift: drift,
    });
  }

  await db.batch(
    metrics.map((metric) =>
      db
        .prepare(
          `INSERT INTO quality_metric (day, metric, value, items) VALUES (?, ?, ?, ?)
           ON CONFLICT (day, metric) DO UPDATE SET value = excluded.value, items = excluded.items`,
        )
        .bind(run.Day, metric.Metric, metric.Value, metric.Items),
    ),
  );
  for (const metric of metrics.filter((item) => item.Drift)) {
    await notify(deps, {
      Type: "quality-drift",
      Source: metric.Metric,
      RunId: run.RunId,
      Summary: `The quality metric ${metric.Metric} of ${run.Day} is ${metric.Value} on ${metric.Items} items, against a median of ${String(metric.Baseline)} over the previous ${monitor.BaselineDays} days. Check the daily processing report before changing a prompt or model (ADR 0071).`,
    });
  }
  return QualitySectionSchema.parse({ Metrics: metrics, ...rest, StartUp: startUp });
}
