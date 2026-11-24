import {
  AGENT_STEPS,
  OpportunityDetailSchema,
  STEP_AGENTS,
  type AgentStepName,
  type OpportunityDetail,
} from "@roi/models";

import { type SqlDatabase } from "./sql.js";

type OpportunityRow = {
  id: string;
  pipeline_status: string;
  current_score_id: string | null;
  updated_at: string;
  candidate_id: string;
  finding: string;
  evidence_quote: string;
  customer: string;
  customer_quote: string;
  why_now: string | null;
  why_now_quote: string | null;
  current_alternative: string | null;
  alternative_quote: string | null;
  publication_id: string;
  title: string;
  doi: string | null;
  published_at: string | null;
};

type EvidenceRow = {
  agent_output_id: string;
  field: string;
  kind: string;
  quote: string | null;
  publication_id: string | null;
  url: string | null;
  note: string | null;
  retrieved_at: string | null;
};

const STEP_OF_AGENT = Object.fromEntries(
  Object.entries(STEP_AGENTS).map(([step, agent]) => [agent, step]),
) as Record<string, AgentStepName>;

/** Thrown when stored rows do not form a valid opportunity; the route answers 500. */
export class InvalidStoredOpportunity extends Error {}

/**
 * The opportunity as the read route returns it (ADR 0058): its publication, its candidate, the
 * agent outputs of its latest pipeline run with their evidence, and its current score. Null for
 * an unknown ID and for a hidden opportunity, which is out of every listing (REQ-DATA-008 AC2).
 */
export async function loadOpportunityDetail(
  db: SqlDatabase,
  opportunityId: string,
): Promise<OpportunityDetail | null> {
  const row = await db
    .prepare(
      `SELECT o.id, o.pipeline_status, o.current_score_id, o.updated_at, c.id AS candidate_id,
              c.finding, c.evidence_quote, c.customer, c.customer_quote, c.why_now,
              c.why_now_quote, c.current_alternative, c.alternative_quote,
              p.id AS publication_id, p.title, p.doi, p.published_at
       FROM opportunity o
       JOIN candidate c ON c.id = o.candidate_id
       JOIN publication p ON p.id = c.publication_id
       WHERE o.id = ?`,
    )
    .bind(opportunityId)
    .first<OpportunityRow>();
  if (row === null || row.pipeline_status === "hidden") {
    return null;
  }

  const outputs = (
    await db
      .prepare(
        `SELECT id, agent, envelope_json FROM agent_output
         WHERE pipeline_run_id = (
           SELECT id FROM pipeline_run WHERE candidate_id = ? ORDER BY started_at DESC, id DESC LIMIT 1
         )`,
      )
      .bind(row.candidate_id)
      .all<{ id: string; agent: string; envelope_json: string }>()
  ).results;
  const evidence = (
    await db
      .prepare(
        `SELECT e.agent_output_id, e.field, e.kind, e.quote, e.publication_id, e.url, e.note,
                e.retrieved_at
         FROM evidence e JOIN agent_output a ON a.id = e.agent_output_id
         WHERE a.candidate_id = ? ORDER BY e.rowid`,
      )
      .bind(row.candidate_id)
      .all<EvidenceRow>()
  ).results;

  const agentOutputs = outputs
    .flatMap((output) => {
      const step = STEP_OF_AGENT[output.agent];
      if (step === undefined) {
        return [];
      }
      const envelope = JSON.parse(output.envelope_json) as {
        Model: string;
        PromptVersion: string;
        Output: unknown;
      };
      return [
        {
          Step: step,
          Agent: output.agent,
          Model: envelope.Model,
          PromptVersion: envelope.PromptVersion,
          Output: envelope.Output,
          Evidence: evidence
            .filter((item) => item.agent_output_id === output.id)
            .map((item) => ({
              Field: item.field,
              Kind: item.kind,
              Quote: item.quote,
              PublicationId: item.publication_id,
              Url: item.url,
              Note: item.note,
              RetrievedAt: item.retrieved_at,
            })),
        },
      ];
    })
    .sort((a, b) => AGENT_STEPS.indexOf(a.Step) - AGENT_STEPS.indexOf(b.Step));

  const score =
    row.current_score_id === null
      ? null
      : await db
          .prepare(
            `SELECT s.categories_json, s.weighted_sum, s.final_score, s.band, s.estimate_based,
                    m.version
             FROM score s JOIN score_model m ON m.id = s.score_model_id WHERE s.id = ?`,
          )
          .bind(row.current_score_id)
          .first<{
            categories_json: string;
            weighted_sum: number;
            final_score: number;
            band: string;
            estimate_based: number;
            version: string;
          }>();

  const parsed = OpportunityDetailSchema.safeParse({
    Id: row.id,
    PipelineStatus: row.pipeline_status,
    Publication: {
      Id: row.publication_id,
      Title: row.title,
      Doi: row.doi,
      PublishedAt: row.published_at,
    },
    Candidate: {
      Id: row.candidate_id,
      Finding: row.finding,
      EvidenceQuote: row.evidence_quote,
      Customer: row.customer,
      CustomerQuote: row.customer_quote,
      WhyNow: row.why_now,
      WhyNowQuote: row.why_now_quote,
      CurrentAlternative: row.current_alternative,
      AlternativeQuote: row.alternative_quote,
    },
    AgentOutputs: agentOutputs,
    Score: score
      ? {
          ModelVersion: score.version,
          Categories: JSON.parse(score.categories_json) as unknown,
          WeightedSum: score.weighted_sum,
          OpportunityScore: score.final_score,
          Band: score.band,
          Labels: score.estimate_based === 1 ? ["estimate-based"] : [],
        }
      : null,
    UpdatedAt: row.updated_at,
  });
  if (!parsed.success) {
    // The message names the field only; stored text never reaches a response or a log.
    throw new InvalidStoredOpportunity(
      `opportunity ${opportunityId} does not match the contract at ${parsed.error.issues[0]?.path.join(".") ?? "?"}`,
    );
  }
  return parsed.data;
}
