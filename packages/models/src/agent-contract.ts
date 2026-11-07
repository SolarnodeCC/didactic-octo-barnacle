import { z } from "zod";

/**
 * Shared parts of every agent and extraction contract (docs/kt/agents/contract-conventions.md).
 * The model fills only `Output`; the pipeline fills the rest of the envelope.
 */

export const IndustrySchema = z.enum([
  "automotive",
  "aerospace-defense",
  "consumer-retail",
  "energy-utilities",
  "banking",
  "insurance",
  "public-sector",
  "life-sciences",
  "other",
]);
export type Industry = z.infer<typeof IndustrySchema>;

export const EvidenceKindSchema = z.enum([
  "publication-quote",
  "related-publication",
  "external-url",
  "none-found",
]);

/** One evidence item (REQ-AGENT-008). The rule per kind follows the conventions table. */
export const EvidenceSchema = z
  .object({
    Field: z.string().min(1),
    Kind: EvidenceKindSchema,
    Quote: z.string().max(500).nullable(),
    PublicationId: z.string().nullable(),
    Url: z.string().nullable(),
    Note: z.string().max(200).nullable(),
    RetrievedAt: z.string().nullable(),
  })
  .superRefine((item, ctx) => {
    if (item.Kind === "publication-quote" && !item.Quote) {
      ctx.addIssue({ code: "custom", path: ["Quote"], message: "a publication quote needs Quote" });
    }
    if (
      (item.Kind === "publication-quote" || item.Kind === "related-publication") &&
      !item.PublicationId
    ) {
      ctx.addIssue({ code: "custom", path: ["PublicationId"], message: "needs PublicationId" });
    }
    if (item.Kind === "external-url" && !item.Url?.startsWith("https://")) {
      ctx.addIssue({ code: "custom", path: ["Url"], message: "an external URL must be https" });
    }
    if (item.Kind === "none-found" && !item.Note) {
      ctx.addIssue({ code: "custom", path: ["Note"], message: "none-found needs a Note" });
    }
  });
export type Evidence = z.infer<typeof EvidenceSchema>;

export const OutputModeSchema = z.enum(["tool-use", "json-schema", "prompt-only"]);
/** Whether a step read the abstract or the full text. */
export const InputModeSchema = z.enum(["abstract", "full-text"]);
export type InputMode = z.infer<typeof InputModeSchema>;
export const RepairKindSchema = z.enum(["unwrapped-json-string", "stripped-code-fence"]);
export type RepairKind = z.infer<typeof RepairKindSchema>;

/** The envelope around an agent output; `output` is that agent's contract schema. */
export function agentEnvelopeSchema<T extends z.ZodType>(output: T) {
  return z.object({
    SchemaVersion: z.string().min(1),
    Agent: z.string().min(1),
    RunId: z.string().min(1),
    PublicationId: z.string().min(1),
    CandidateId: z.string().nullable(),
    Model: z.string().min(1),
    PromptVersion: z.string().min(1),
    InputMode: InputModeSchema,
    OutputMode: OutputModeSchema,
    Attempts: z.number().int().min(1),
    Repairs: z.array(RepairKindSchema),
    Output: output,
    Evidence: z.array(EvidenceSchema).max(20),
  });
}

/**
 * The body of a markdown code fence around the whole text, or null. Plain string
 * operations, no regular expression: model output is untrusted, and a backtracking
 * pattern over it can take polynomial time.
 */
function fencedBody(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```") || !trimmed.endsWith("```") || trimmed.length < 6) {
    return null;
  }
  const firstLineEnd = trimmed.indexOf("\n");
  if (firstLineEnd === -1) {
    return null;
  }
  // The opening line holds only the fence and an optional language tag, such as `json`.
  const tag = trimmed.slice(3, firstLineEnd).trim();
  if (!/^[a-zA-Z]*$/u.test(tag)) {
    return null;
  }
  return trimmed.slice(firstLineEnd + 1, trimmed.length - 3).trim();
}

/** The repaired value and the repairs applied, or the reason it could not be read. */
export type RepairResult =
  | { Ok: true; Value: unknown; Repairs: RepairKind[] }
  | { Ok: false; Error: string; Repairs: RepairKind[] };

function expectsContainer(schema: z.ZodType | undefined): boolean {
  let current: unknown = schema;
  // Look through nullable and optional wrappers to the field's own type.
  while (current instanceof z.ZodNullable || current instanceof z.ZodOptional) {
    current = current.unwrap();
  }
  return current instanceof z.ZodArray || current instanceof z.ZodObject;
}

/**
 * The only two repairs before validation (REQ-AGENT-011): strip a markdown code fence
 * around the whole output, and decode once a top-level field that holds a JSON string
 * where the contract expects an array or object. A repair never changes a value, adds a
 * field, or fills a default; the result still goes through full validation.
 */
export function repairModelOutput(raw: unknown, contract: z.ZodObject): RepairResult {
  const repairs: RepairKind[] = [];
  let value: unknown = raw;
  if (typeof value === "string") {
    const fenced = fencedBody(value);
    if (fenced !== null) {
      value = fenced;
      repairs.push("stripped-code-fence");
    }
    try {
      value = JSON.parse(value as string);
    } catch {
      return { Ok: false, Error: "the output is not JSON", Repairs: repairs };
    }
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { Ok: true, Value: value, Repairs: repairs };
  }
  const shape = contract.shape as Record<string, z.ZodType>;
  const fields: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  let decoded = false;
  for (const [key, field] of Object.entries(fields)) {
    if (typeof field !== "string" || !expectsContainer(shape[key])) {
      continue;
    }
    try {
      const parsed: unknown = JSON.parse(field);
      if (parsed !== null && typeof parsed === "object") {
        fields[key] = parsed;
        decoded = true;
      }
    } catch {
      // Not JSON: left as it is, so validation reports the wrong type.
    }
  }
  if (decoded) {
    repairs.push("unwrapped-json-string");
  }
  return { Ok: true, Value: fields, Repairs: repairs };
}

/** Quotes that do not occur verbatim in the text the step received (REQ-AGENT-008). */
export function missingQuotes(
  quotes: ReadonlyArray<{ Field: string; Quote: string | null }>,
  text: string,
): string[] {
  return quotes
    .filter((item) => item.Quote !== null && !text.includes(item.Quote))
    .map((item) => item.Field);
}
