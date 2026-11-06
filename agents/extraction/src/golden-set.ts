import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";
import { z } from "zod";

/** `agents/extraction/evals`, the golden sets of triage and extraction (REQ-TEST-005). */
export const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../evals");

/** The input a triage or extraction step receives in phase 2: title and abstract. */
export type Publication = { Id: string; Title: string; Abstract: string; Text: string };

const FixtureSchema = z.object({ id: z.string(), title: z.string(), summary: z.string() });

const SignalsSchema = z.object({
  namedParty: z.boolean(),
  statedHarm: z.boolean(),
  trigger: z.boolean(),
  existingAlternative: z.boolean(),
  adoptable: z.boolean(),
});

const TriageEntrySchema = z.object({
  id: z.string(),
  publicationFixture: z.string(),
  expected: z.object({ signals: SignalsSchema, accepted: z.boolean(), reason: z.string() }),
});

const CandidateSchema = z.object({
  finding: z.string(),
  evidenceQuote: z.string(),
  customer: z.string(),
  customerQuote: z.string(),
  whyNow: z.string().nullable().optional(),
  whyNowQuote: z.string().nullable().optional(),
  currentAlternative: z.string().nullable().optional(),
  alternativeQuote: z.string().nullable().optional(),
});

const ExtractionEntrySchema = z.object({
  id: z.string(),
  publicationFixture: z.string(),
  industry: z.string(),
  expected: z.object({ candidates: z.array(CandidateSchema), reason: z.string().optional() }),
});

export type TriageEntry = z.infer<typeof TriageEntrySchema> & { Publication: Publication };
export type ExtractionEntry = z.infer<typeof ExtractionEntrySchema> & { Publication: Publication };

export const ThresholdSchema = z.object({
  metric: z.literal("entry-pass-rate"),
  minimum: z.number().min(0).max(1),
  tolerance: z.number().min(0).max(1),
});
export type Threshold = z.infer<typeof ThresholdSchema>;

function loadPublication(dir: string, fixture: string): Publication {
  const data = FixtureSchema.parse(JSON.parse(readFileSync(join(dir, fixture), "utf8")));
  // The same text the golden-set check quotes against (scripts/check-golden-sets.py).
  return {
    Id: data.id,
    Title: data.title,
    Abstract: data.summary,
    Text: `${data.title} ${data.summary}`,
  };
}

function loadEntries<T>(dir: string, set: string, schema: z.ZodType<T>): T[] {
  return readdirSync(join(dir, set))
    .filter((name) => name.endsWith(".yaml"))
    .sort()
    .map((name) => schema.parse(parse(readFileSync(join(dir, set, name), "utf8"))));
}

export function loadTriageSet(dir: string = EVALS_DIR): TriageEntry[] {
  return loadEntries(dir, "triage", TriageEntrySchema).map((entry) => ({
    ...entry,
    Publication: loadPublication(dir, entry.publicationFixture),
  }));
}

export function loadExtractionSet(dir: string = EVALS_DIR): ExtractionEntry[] {
  return loadEntries(dir, "extraction", ExtractionEntrySchema).map((entry) => ({
    ...entry,
    Publication: loadPublication(dir, entry.publicationFixture),
  }));
}

export function loadThreshold(name: "triage" | "extraction", dir: string = EVALS_DIR): Threshold {
  return ThresholdSchema.parse(
    JSON.parse(readFileSync(join(dir, `${name}.threshold.json`), "utf8")),
  );
}
