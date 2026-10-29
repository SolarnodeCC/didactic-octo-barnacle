/**
 * D1 columns required by the phase 1 Zod contracts in @roi/models (REQ-NFR-020).
 * Keep snake_case here; packages/models field names stay PascalCase.
 */

export type ExpectedTable = {
  name: string;
  columns: string[];
};

export const EXPECTED_PHASE1_TABLES: ExpectedTable[] = [
  {
    name: "publications",
    columns: [
      "id",
      "title",
      "abstract",
      "publication_date",
      "doi",
      "arxiv_id",
      "arxiv_version",
      "topics_json",
      "citation_count",
      "completeness",
      "missing_fields_json",
      "retraction_flag",
      "language",
      "has_storable_pdf",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "source_records",
    columns: [
      "id",
      "publication_id",
      "source",
      "source_id",
      "fetched_at",
      "metadata_license",
      "open_access_url",
      "pdf_url",
      "pdf_license",
    ],
  },
  {
    name: "authors",
    columns: ["id", "display_name", "orcid"],
  },
  {
    name: "authorships",
    columns: ["publication_id", "author_id", "position", "affiliations_json"],
  },
  {
    name: "documents",
    columns: [
      "id",
      "publication_id",
      "content_hash",
      "storage_key",
      "license",
      "extracted_text_key",
      "extractor_version",
      "stored_at",
    ],
  },
  {
    name: "ingestion_runs",
    columns: [
      "id",
      "source",
      "cursor",
      "status",
      "started_at",
      "ended_at",
      "counts_json",
      "failures_json",
    ],
  },
  {
    name: "ingestion_cursors",
    columns: ["source", "cursor", "last_success_at"],
  },
  {
    name: "queue_message_logs",
    columns: [
      "message_id",
      "type",
      "schema_version",
      "status",
      "attempts",
      "dead_letter",
      "last_error",
      "created_at",
      "updated_at",
    ],
  },
  {
    name: "title_author_reviews",
    columns: [
      "id",
      "review_key",
      "incoming_source",
      "incoming_source_id",
      "existing_publication_id",
      "status",
      "created_at",
      "updated_at",
    ],
  },
];
