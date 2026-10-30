export {
  ArxivIdSchema,
  CompletenessSchema,
  DoiSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  SourceNameSchema,
  normalizeDoi,
  parseArxivVersion,
  stripArxivVersion,
  type Completeness,
  type SourceName,
} from "./common.js";

export {
  PublicationSchema,
  REQUIRED_PUBLICATION_FIELDS,
  missingPublicationFields,
  type Publication,
} from "./publication.js";

export { SourceRecordSchema, type SourceRecord } from "./source-record.js";

export { AuthorSchema, AuthorshipSchema, type Author, type Authorship } from "./author.js";

export {
  DocumentSchema,
  STORABLE_PDF_LICENSES,
  StorablePdfLicenseSchema,
  isStorablePdfLicense,
  type Document,
  type StorablePdfLicense,
} from "./document.js";

export {
  IngestionRunCountsSchema,
  IngestionRunFailureSchema,
  IngestionRunSchema,
  IngestionRunStatusSchema,
  type IngestionRun,
  type IngestionRunCounts,
  type IngestionRunFailure,
  type IngestionRunStatus,
} from "./ingestion-run.js";

export {
  QueueMessageEnvelopeSchema,
  QueueMessageIdsSchema,
  QueueMessageLogSchema,
  QueueMessageStatusSchema,
  QueueMessageTypeSchema,
  type QueueMessageEnvelope,
  type QueueMessageIds,
  type QueueMessageLog,
  type QueueMessageStatus,
  type QueueMessageType,
} from "./queue-message.js";

export {
  matchPublicationIdentifiers,
  titleAuthorReviewKey,
  type DedupeIdentifiers,
  type DedupeMatch,
} from "./dedupe.js";

export { AlertTypeSchema, RunReportSchema, type AlertType, type RunReport } from "./run-report.js";

export {
  ErasureReasonSchema,
  ErasureRecordSchema,
  type ErasureReason,
  type ErasureRecord,
} from "./erasure.js";
