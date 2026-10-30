import { z } from "zod";

/**
 * Why an author was erased. A fixed list, not free text: the audit log must not hold
 * personal data, and a request often names the person (REQ-NFR-016 AC2).
 */
export const ErasureReasonSchema = z.enum(["author-request", "legal-order", "ingested-in-error"]);

export type ErasureReason = z.infer<typeof ErasureReasonSchema>;

/**
 * One entry of the durable erasure list in the bucket: a keyed hash of the stored author
 * ID and a reason code. It holds no name, ORCID, or affiliation.
 */
export const ErasureRecordSchema = z.object({
  ErasureId: z.string().min(1),
  SubjectHash: z.string().regex(/^[0-9a-f]{64}$/),
  Reason: ErasureReasonSchema,
  ErasedAt: z.string().min(1),
});

export type ErasureRecord = z.infer<typeof ErasureRecordSchema>;
