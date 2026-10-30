/**
 * The phase 1 measurements, one read-only query each (docs/kt/data-sources/ingestion-scope.md,
 * "Measure in phase 1"). The names are the keys of the results; the CLI runs them one by
 * one against D1, and the tests run the same text against a database with the real
 * migrations.
 */
export type MeasurementQuery = { Name: MeasurementName; Sql: string };

export type MeasurementName =
  | "runs_per_day"
  | "publications_per_publication_day"
  | "quality_by_source"
  | "documents_by_license"
  | "document_messages"
  | "dead_letters"
  | "overview";

export const MEASUREMENT_QUERIES: readonly MeasurementQuery[] = [
  {
    Name: "runs_per_day",
    Sql: `SELECT substr(started_at, 1, 10) AS day, source, COUNT(*) AS runs,
  SUM(status = 'succeeded') AS succeeded, SUM(status = 'partial') AS partial, SUM(status = 'failed') AS failed,
  SUM(json_extract(counts_json, '$.Fetched')) AS fetched, SUM(json_extract(counts_json, '$.Created')) AS created,
  SUM(json_extract(counts_json, '$.Updated')) AS updated, SUM(json_extract(counts_json, '$.Skipped')) AS skipped,
  SUM(json_extract(counts_json, '$.Failed')) AS failed_items, SUM(json_extract(counts_json, '$.DeadLettered')) AS dead_lettered,
  SUM(pages_done) AS pages, ROUND(AVG((julianday(ended_at) - julianday(started_at)) * 86400)) AS avg_seconds
FROM ingestion_run GROUP BY day, source ORDER BY day, source`,
  },
  {
    // The arrival rate by publication date does not depend on when we ingested, so the
    // 30-day backfill of the first run already gives a daily rate.
    Name: "publications_per_publication_day",
    Sql: `SELECT p.published_at AS day, s.source AS source, COUNT(DISTINCT p.id) AS publications
FROM publication p JOIN source_record s ON s.publication_id = p.id
WHERE p.published_at IS NOT NULL GROUP BY p.published_at, s.source ORDER BY p.published_at, s.source`,
  },
  {
    Name: "quality_by_source",
    Sql: `SELECT s.source AS source, COUNT(DISTINCT p.id) AS publications,
  COUNT(DISTINCT CASE WHEN p.abstract IS NOT NULL AND p.abstract <> '' THEN p.id END) AS with_abstract,
  COUNT(DISTINCT CASE WHEN p.completeness = 'complete' THEN p.id END) AS complete,
  COUNT(DISTINCT CASE WHEN p.has_storable_pdf = 1 THEN p.id END) AS storable_pdf,
  ROUND(AVG(length(p.abstract))) AS avg_abstract_chars, MAX(length(p.abstract)) AS max_abstract_chars
FROM publication p JOIN source_record s ON s.publication_id = p.id GROUP BY s.source ORDER BY s.source`,
  },
  {
    Name: "documents_by_license",
    Sql: "SELECT license, COUNT(*) AS documents FROM document GROUP BY license ORDER BY documents DESC",
  },
  {
    Name: "document_messages",
    Sql: `SELECT status, CASE WHEN last_error IS NULL THEN 'none' ELSE substr(last_error, 1, instr(last_error || ':', ':') - 1) END AS reason,
  COUNT(*) AS messages
FROM queue_message_log WHERE type = 'document.ingest' GROUP BY status, reason ORDER BY messages DESC`,
  },
  {
    Name: "dead_letters",
    Sql: "SELECT type, COUNT(*) AS messages FROM queue_message_log WHERE status = 'dead-lettered' GROUP BY type",
  },
  {
    Name: "overview",
    Sql: `SELECT (SELECT COUNT(*) FROM publication) AS publications,
  (SELECT MIN(created_at) FROM publication) AS first_stored_at, (SELECT MAX(created_at) FROM publication) AS last_stored_at,
  (SELECT COUNT(*) FROM title_author_review) AS duplicates_flagged,
  (SELECT COUNT(*) FROM ingestion_run WHERE failures_json LIKE '%page cap%') AS runs_stopped_by_page_cap,
  (SELECT COUNT(*) FROM alert_state) AS alert_keys, (SELECT COALESCE(SUM(occurrences), 0) FROM alert_state) AS alerts,
  (SELECT COUNT(*) FROM author_erasure) AS erasures`,
  },
];
