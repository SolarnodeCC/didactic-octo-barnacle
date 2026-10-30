/**
 * D1 columns required by the phase 1 Zod contracts in @roi/models (REQ-NFR-020).
 * Names follow docs/kt/architecture/schema-migration-0001.md; packages/models field names stay PascalCase.
 */

export type ExpectedTable = {
  name: string;
  columns: string[];
};

export const EXPECTED_PHASE1_TABLES: ExpectedTable[] = [
  {
    name: "publication",
    columns: [
      "id",
      "title",
      "abstract",
      "published_at",
      "doi",
      "arxiv_id",
      "arxiv_version",
      "citation_count",
      "completeness",
      "retracted",
      "topics_json",
      "missing_fields_json",
      "language",
      "has_storable_pdf",
      "title_author_key",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "source_record",
    columns: [
      "id",
      "publication_id",
      "source",
      "source_work_id",
      "fetched_at",
      "metadata_license",
      "raw_r2_key",
      "open_access_url",
      "pdf_url",
      "pdf_license",
    ],
  },
  {
    name: "author",
    columns: ["id", "display_name", "orcid"],
  },
  {
    name: "authorship",
    columns: ["publication_id", "author_id", "affiliation", "position", "affiliations_json"],
  },
  {
    name: "document",
    columns: [
      "id",
      "publication_id",
      "pdf_r2_key",
      "content_hash",
      "license",
      "extracted_text_r2_key",
      "extractor_version",
      "status",
      "stored_at",
    ],
  },
  {
    name: "ingestion_run",
    columns: [
      "id",
      "source",
      "cursor",
      "started_at",
      "ended_at",
      "counts_json",
      "failures_json",
      "status",
      "window_from",
      "page_cursor",
      "pages_done",
    ],
  },
  {
    name: "queue_message_log",
    columns: [
      "id",
      "message_id",
      "type",
      "schema_version",
      "status",
      "attempts",
      "dead_letter",
      "updated_at",
      "last_error",
      "created_at",
      "payload_json",
    ],
  },
  {
    name: "title_author_review",
    columns: [
      "id",
      "review_key",
      "incoming_source",
      "incoming_source_work_id",
      "existing_publication_id",
      "status",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "alert_state",
    columns: ["alert_key", "issue_number", "first_alerted_at", "last_alerted_at", "occurrences"],
  },
  {
    name: "author_erasure",
    columns: ["id", "subject_hash", "reason", "erased_at"],
  },
  {
    name: "audit_event",
    columns: ["id", "organization_id", "actor_id_opaque", "action", "created_at", "meta_json"],
  },
];
