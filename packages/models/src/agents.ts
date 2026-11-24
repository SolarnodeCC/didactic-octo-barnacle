import { z } from "zod";

import { MoneySchema } from "./money.js";

/**
 * Output contracts of the three agents that follow Problem Discovery and have no benchmark
 * before phase 3: Market Analysis, Competition, and the Startup Generator
 * (docs/kt/agents/market-analysis.md, competition.md, startup-generator.md; REQ-AGENT-003,
 * REQ-AGENT-004, REQ-AGENT-005). As in `analysis.ts`, the model fills only these and the
 * pipeline fills the envelope and the evidence items. The thin slice stubs them with the
 * examples (REQ-PROC-007 AC3).
 */

const Confidence = z.number().min(0).max(1);
const Notes = z.string().max(400).nullable();
const Basis = z.enum(["sourced", "estimated"]);

/** A market figure is a range in one currency, never a single number (market-analysis.md). */
export const MarketFigureSchema = z
  .object({
    Low: MoneySchema,
    High: MoneySchema,
    Year: z.number().int().min(2000).max(2100),
    Geography: z.string().min(1).max(60),
    Basis,
  })
  .strict()
  .refine((figure) => figure.Low.Currency === figure.High.Currency, {
    path: ["High"],
    message: "Low and High use the same currency",
  })
  .refine((figure) => figure.High.Amount >= figure.Low.Amount, {
    path: ["High"],
    message: "High is not below Low",
  });
export type MarketFigure = z.infer<typeof MarketFigureSchema>;

/** Market Analysis (REQ-AGENT-003). SAM is not larger than TAM in the same currency. */
export const MarketAnalysisOutputSchema = z
  .object({
    TAM: MarketFigureSchema,
    SAM: MarketFigureSchema,
    GrowthRate: z
      .object({
        CagrPercent: z.number().min(-50).max(100),
        Period: z.string().min(1).max(20),
        Basis,
      })
      .strict(),
    Method: z.enum(["top-down", "bottom-up"]),
    Assumptions: z.array(z.string().min(1).max(200)).min(1).max(5),
    Confidence,
    Notes,
  })
  .strict()
  .refine(
    (output) =>
      output.SAM.High.Currency !== output.TAM.High.Currency ||
      output.SAM.High.Amount <= output.TAM.High.Amount,
    { path: ["SAM"], message: "SAM is not larger than TAM" },
  );
export type MarketAnalysisOutput = z.infer<typeof MarketAnalysisOutputSchema>;

export const CompetitorSchema = z
  .object({
    Name: z.string().min(1).max(80),
    Url: z.string().nullable().optional(),
    Kind: z.enum(["direct", "indirect", "substitute"]),
    Description: z.string().min(1).max(200),
    /** True only when the search tool found it (REQ-AGENT-013). */
    Verified: z.boolean(),
  })
  .strict();
export type Competitor = z.infer<typeof CompetitorSchema>;

/** Competition (REQ-AGENT-004). */
export const CompetitionOutputSchema = z
  .object({
    Competitors: z.array(CompetitorSchema).max(10),
    Saturation: z.number().int().min(1).max(5),
    Gap: z.string().min(1).max(400),
    GapStrength: z.number().int().min(1).max(5),
    Differentiation: z.string().min(1).max(400),
    Confidence,
    Notes,
  })
  .strict();
export type CompetitionOutput = z.infer<typeof CompetitionOutputSchema>;

const BriefEntrySchema = z
  .object({
    KillQuestion: z.string().min(1).max(200),
    StopCriterion: z.string().min(1).max(200),
  })
  .strict();

/** Startup Generator (REQ-AGENT-005). The validation brief is generated text, never scored. */
export const StartupGeneratorOutputSchema = z
  .object({
    StartupName: z.string().min(1).max(40),
    OpportunityType: z.enum(["saas", "ai-solution", "enterprise-software", "digital-service"]),
    ValueProposition: z.string().min(1).max(280),
    TargetCustomer: z.string().min(1).max(120),
    BusinessModel: z.enum(["subscription", "usage-based", "license", "services", "marketplace"]),
    Pricing: z
      .object({
        Model: z.enum(["per-user", "per-usage", "flat", "tiered"]),
        Price: MoneySchema,
        Unit: z.string().min(1).max(40),
      })
      .strict(),
    USP: z.string().min(1).max(280),
    MvpFeatures: z.array(z.string().min(1).max(120)).min(3).max(7),
    NextSteps: z.array(z.string().min(1).max(160)).min(3).max(5),
    BusinessCase: z
      .object({
        Summary: z.string().min(1).max(600),
        KeyAssumptions: z.array(z.string().min(1).max(200)).min(2).max(5),
        KeyRisks: z.array(z.string().min(1).max(200)).min(2).max(5),
      })
      .strict(),
    ValidationBrief: z
      .object({
        Problem: BriefEntrySchema,
        Customer: BriefEntrySchema,
        Market: BriefEntrySchema,
        ReasonToWin: BriefEntrySchema,
        WhyNow: BriefEntrySchema,
      })
      .strict(),
    Confidence,
    Notes,
  })
  .strict();
export type StartupGeneratorOutput = z.infer<typeof StartupGeneratorOutputSchema>;
