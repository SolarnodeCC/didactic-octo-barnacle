import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  IndustrySchema,
  ImplementationEffortSchema,
  MaturitySchema,
  TargetIndustrySchema,
} from "@roi/models";
import { parse } from "yaml";
import { z } from "zod";

import {
  CandidateSchema,
  ThresholdSchema,
  loadEntries,
  loadPublication,
  type Publication,
  type Threshold,
} from "../golden-set.js";

/**
 * The golden sets of Research Analyst, Problem Discovery, and Relevance (REQ-TEST-005,
 * `agents/analysis/evals`). Paths in an entry are relative to that directory. Each agent reads
 * frozen inputs: the extraction candidate and the `handoff` and facts of the entries it
 * references, never another candidate model's output (ADR 0093).
 */
export const ANALYSIS_EVALS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../analysis/evals",
);

const Range = z.tuple([z.number().int(), z.number().int()]);

const ResearchAnalystEntrySchema = z.object({
  id: z.string(),
  publicationFixture: z.string(),
  candidateRef: z.string(),
  neighborsFixture: z.string(),
  expected: z.object({
    noveltyRange: Range,
    maturity: MaturitySchema,
    industriesInclude: z.array(IndustrySchema),
  }),
  handoff: z.object({
    novelty: z.number().int(),
    maturity: MaturitySchema,
    industry: z.array(IndustrySchema),
    technology: z.array(z.string()),
  }),
});

const ProblemDiscoveryEntrySchema = z.object({
  id: z.string(),
  publicationFixture: z.string(),
  candidateRef: z.string(),
  researchAnalystRef: z.string(),
  expected: z.object({
    requiredFacts: z.array(z.string().min(1)).min(1),
    customerIndustry: IndustrySchema,
    painLevelRange: Range,
  }),
});

const RelevanceEntrySchema = z.object({
  id: z.string(),
  publicationFixture: z.string(),
  candidateRef: z.string(),
  researchAnalystRef: z.string(),
  problemDiscoveryRef: z.string(),
  expected: z.object({
    bestIndustry: TargetIndustrySchema,
    strategicRelevanceRange: Range,
    technicalFeasibilityRange: Range,
    implementationEffort: ImplementationEffortSchema,
  }),
});

const NeighborSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  published: z.string(),
});

export type Candidate = z.infer<typeof CandidateSchema>;
export type Neighbor = { Id: string; Title: string; Abstract: string; Published: string };

export type ResearchAnalystEntry = z.infer<typeof ResearchAnalystEntrySchema> & {
  Publication: Publication;
  Candidate: Candidate;
  Neighbors: Neighbor[];
};
export type ProblemDiscoveryEntry = z.infer<typeof ProblemDiscoveryEntrySchema> & {
  Publication: Publication;
  Candidate: Candidate;
  /** The frozen Research Analyst output of the referenced entry. */
  ResearchAnalyst: z.infer<typeof ResearchAnalystEntrySchema>["handoff"];
};
export type RelevanceEntry = z.infer<typeof RelevanceEntrySchema> & {
  Publication: Publication;
  Candidate: Candidate;
  ResearchAnalyst: z.infer<typeof ResearchAnalystEntrySchema>["handoff"];
  /** The labelled facts of the referenced Problem Discovery entry. */
  ProblemDiscovery: z.infer<typeof ProblemDiscoveryEntrySchema>["expected"];
};

/** The candidate a `candidateRef` such as `../../extraction/evals/extraction/gs-extraction-001.yaml#0` names. */
export function resolveCandidate(dir: string, ref: string): Candidate {
  const [file, index] = ref.split("#");
  const data = z
    .object({ expected: z.object({ candidates: z.array(CandidateSchema) }) })
    .parse(parse(readFileSync(join(dir, file ?? ""), "utf8")));
  const candidate = data.expected.candidates[Number(index)];
  if (candidate === undefined) {
    throw new Error(`candidateRef ${ref} names no candidate`);
  }
  return candidate;
}

function readYaml<T>(dir: string, file: string, schema: z.ZodType<T>): T {
  return schema.parse(parse(readFileSync(join(dir, file), "utf8")));
}

function loadNeighbors(dir: string, file: string): Neighbor[] {
  return z
    .array(NeighborSchema)
    .parse(JSON.parse(readFileSync(join(dir, file), "utf8")))
    .map((n) => ({ Id: n.id, Title: n.title, Abstract: n.summary, Published: n.published }));
}

export function loadResearchAnalystSet(dir: string = ANALYSIS_EVALS_DIR): ResearchAnalystEntry[] {
  return loadEntries(dir, "research-analyst", ResearchAnalystEntrySchema).map((entry) => ({
    ...entry,
    Publication: loadPublication(dir, entry.publicationFixture),
    Candidate: resolveCandidate(dir, entry.candidateRef),
    Neighbors: loadNeighbors(dir, entry.neighborsFixture),
  }));
}

export function loadProblemDiscoverySet(dir: string = ANALYSIS_EVALS_DIR): ProblemDiscoveryEntry[] {
  return loadEntries(dir, "problem-discovery", ProblemDiscoveryEntrySchema).map((entry) => ({
    ...entry,
    Publication: loadPublication(dir, entry.publicationFixture),
    Candidate: resolveCandidate(dir, entry.candidateRef),
    ResearchAnalyst: readYaml(dir, entry.researchAnalystRef, ResearchAnalystEntrySchema).handoff,
  }));
}

export function loadRelevanceSet(dir: string = ANALYSIS_EVALS_DIR): RelevanceEntry[] {
  return loadEntries(dir, "relevance", RelevanceEntrySchema).map((entry) => ({
    ...entry,
    Publication: loadPublication(dir, entry.publicationFixture),
    Candidate: resolveCandidate(dir, entry.candidateRef),
    ResearchAnalyst: readYaml(dir, entry.researchAnalystRef, ResearchAnalystEntrySchema).handoff,
    ProblemDiscovery: readYaml(dir, entry.problemDiscoveryRef, ProblemDiscoveryEntrySchema)
      .expected,
  }));
}

export type AnalysisSet = "research-analyst" | "problem-discovery" | "relevance";

export function loadAnalysisThreshold(
  name: AnalysisSet,
  dir: string = ANALYSIS_EVALS_DIR,
): Threshold {
  return ThresholdSchema.parse(
    JSON.parse(readFileSync(join(dir, `${name}.threshold.json`), "utf8")),
  );
}
