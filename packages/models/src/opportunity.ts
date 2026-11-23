import { z } from "zod";

import { EvidenceSchema } from "./agent-contract.js";
import {
  CompetitionOutputSchema,
  MarketAnalysisOutputSchema,
  StartupGeneratorOutputSchema,
} from "./agents.js";
import {
  ProblemDiscoveryOutputSchema,
  RelevanceModelOutputSchema,
  ResearchAnalystOutputSchema,
} from "./analysis.js";
import { IsoDateTimeSchema } from "./common.js";
import { ExtractionCandidateSchema } from "./extraction.js";

/**
 * The candidate pipeline and its opportunity (docs/kt/architecture/orchestration.md,
 * schema-migration-0001.md, ADR 0015): one Workflow per candidate, one step per agent, then
 * scoring. The thin slice runs it with stub steps (REQ-PROC-007).
 */

/** Workflow step names, equal to `pipeline_step.step_name` (orchestration.md). */
export const PipelineStepNameSchema = z.enum([
  "research_analyst",
  "problem_discovery",
  "market_analysis",
  "competition",
  "relevance",
  "startup_generator",
  "scoring",
]);
export type PipelineStepName = z.infer<typeof PipelineStepNameSchema>;

/** The agent steps, in the order their outputs are shown. */
export const AGENT_STEPS = [
  "research_analyst",
  "problem_discovery",
  "market_analysis",
  "competition",
  "relevance",
  "startup_generator",
] as const satisfies readonly PipelineStepName[];
export type AgentStepName = (typeof AGENT_STEPS)[number];

/** The agent each step runs, as named in the envelope and in the examples. */
export const STEP_AGENTS = {
  research_analyst: "ResearchAnalyst",
  problem_discovery: "ProblemDiscovery",
  market_analysis: "MarketAnalysis",
  competition: "Competition",
  relevance: "Relevance",
  startup_generator: "StartupGenerator",
} as const satisfies Record<AgentStepName, string>;
export type AgentName = (typeof STEP_AGENTS)[AgentStepName];

/** The output contract of each agent step. */
export const AGENT_OUTPUT_SCHEMAS = {
  research_analyst: ResearchAnalystOutputSchema,
  problem_discovery: ProblemDiscoveryOutputSchema,
  market_analysis: MarketAnalysisOutputSchema,
  competition: CompetitionOutputSchema,
  relevance: RelevanceModelOutputSchema,
  startup_generator: StartupGeneratorOutputSchema,
} as const satisfies Record<AgentStepName, z.ZodType>;

export const PipelineRunStatusSchema = z.enum(["running", "complete", "incomplete"]);
export const PipelineStepStatusSchema = z.enum(["running", "complete", "failed"]);

/** `opportunity.pipeline_status` is system state (schema-migration-0001.md, REQ-SCORE-005). */
export const OpportunityStatusSchema = z.enum(["complete", "incomplete", "hidden"]);
export type OpportunityStatus = z.infer<typeof OpportunityStatusSchema>;

/** Why an opportunity is hidden: a retracted publication (REQ-DATA-008 AC2). */
export const OpportunityHiddenReasonSchema = z.enum(["retracted"]);

/** The five score categories of scoring.md, each 0 to 100. */
export const ScoreCategoriesSchema = z
  .object({
    ScientificNovelty: z.number().min(0).max(100),
    MarketPotential: z.number().min(0).max(100),
    CompetitiveGap: z.number().min(0).max(100),
    TechnicalFeasibility: z.number().min(0).max(100),
    StrategicRelevance: z.number().min(0).max(100),
  })
  .strict();
export type ScoreCategories = z.infer<typeof ScoreCategoriesSchema>;

export const ScoreBandSchema = z.enum(["Low", "Medium", "High", "Exceptional"]);
export type ScoreBand = z.infer<typeof ScoreBandSchema>;

/** The band of a final score: 0-39 Low, 40-69 Medium, 70-89 High, 90-100 Exceptional. */
export function scoreBand(score: number): ScoreBand {
  if (score >= 90) {
    return "Exceptional";
  }
  if (score >= 70) {
    return "High";
  }
  if (score >= 40) {
    return "Medium";
  }
  return "Low";
}

export const ScoreLabelSchema = z.enum(["estimate-based"]);

/**
 * The score of an opportunity as shown (scoring.md, REQ-SCORE-001 AC4): the category values,
 * the score model version they were computed with, the weighted sum, and the rounded score.
 */
export const OpportunityScoreSchema = z
  .object({
    ModelVersion: z.string().min(1),
    Categories: ScoreCategoriesSchema,
    WeightedSum: z.number().min(0).max(100),
    OpportunityScore: z.number().int().min(0).max(100),
    Band: ScoreBandSchema,
    Labels: z.array(ScoreLabelSchema),
  })
  .strict()
  .refine((score) => score.Band === scoreBand(score.OpportunityScore), {
    path: ["Band"],
    message: "the band follows the score",
  });
export type OpportunityScore = z.infer<typeof OpportunityScoreSchema>;

/** A stored score model: weights per category in percent, summing to 100. */
export const ScoreModelSchema = z
  .object({
    Id: z.string().min(1),
    Version: z.string().min(1),
    Weights: z.record(z.string(), z.number().min(0).max(100)),
    DerivationRuleVersion: z.string().min(1),
    Active: z.boolean(),
  })
  .strict()
  .refine(
    (model) => Math.abs(Object.values(model.Weights).reduce((sum, w) => sum + w, 0) - 100) < 1e-9,
    { path: ["Weights"], message: "the weights sum to 100" },
  );
export type ScoreModel = z.infer<typeof ScoreModelSchema>;

/** One stored agent output with its evidence, as the read route returns it. */
export const AgentOutputViewSchema = z
  .object({
    Step: z.enum(AGENT_STEPS),
    Agent: z.string().min(1),
    Model: z.string().min(1),
    PromptVersion: z.string().min(1),
    Output: z.unknown(),
    Evidence: z.array(EvidenceSchema).max(20),
  })
  .strict()
  .superRefine((view, ctx) => {
    const parsed = AGENT_OUTPUT_SCHEMAS[view.Step].safeParse(view.Output);
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        path: ["Output"],
        message: `not a valid ${view.Step} output: ${parsed.error.issues[0]?.message ?? ""}`,
      });
    }
  });
export type AgentOutputView = z.infer<typeof AgentOutputViewSchema>;

/**
 * The response of `GET /api/v1/opportunities/:id` (ADR 0058): the opportunity with its
 * publication, candidate, agent outputs and evidence, and its current score. Phase 4 keeps
 * this shape and adds fields.
 */
export const OpportunityDetailSchema = z
  .object({
    Id: z.string().min(1),
    PipelineStatus: OpportunityStatusSchema,
    Publication: z
      .object({
        Id: z.string().min(1),
        Title: z.string().min(1),
        Doi: z.string().nullable(),
        PublishedAt: z.string().nullable(),
      })
      .strict(),
    Candidate: ExtractionCandidateSchema.and(z.object({ Id: z.string().min(1) })),
    AgentOutputs: z.array(AgentOutputViewSchema).max(AGENT_STEPS.length),
    Score: OpportunityScoreSchema.nullable(),
    UpdatedAt: IsoDateTimeSchema,
  })
  .strict();
export type OpportunityDetail = z.infer<typeof OpportunityDetailSchema>;
