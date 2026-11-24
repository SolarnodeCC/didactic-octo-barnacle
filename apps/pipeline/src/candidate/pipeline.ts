import {
  AGENT_OUTPUT_SCHEMAS,
  STEP_AGENTS,
  agentEnvelopeSchema,
  type AgentStepName,
  type ExtractionCandidate,
  type InputMode,
} from "@roi/models";

import { deriveCategories, weightedScore } from "./scoring.js";
import { type AgentStepInput, type CandidateSteps } from "./steps.js";
import { type PipelineDeps } from "../queue/deps.js";
import { type SqlDatabase, type SqlStatement } from "../store/sql.js";

/**
 * The durable step runner of a Workflow: Cloudflare's `WorkflowStep` satisfies it, and the
 * thin slice and the tests run steps inline (ADR 0117). A step returns small serializable
 * values: IDs, not payloads (orchestration.md).
 */
export type StepRunner = {
  do<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

/** The parameters of one candidate Workflow instance. */
export type CandidateRunParams = { PipelineRunId: string };

export type CandidatePipelineDeps = Pick<PipelineDeps, "Db" | "Now" | "NewId" | "Log"> & {
  Steps: CandidateSteps;
};

export type CandidatePipelineOutcome = {
  PipelineRunId: string;
  Status: "complete" | "incomplete";
  ScoreId: string | null;
};

const ENVELOPE_SCHEMA_VERSION = "1";

type RunRow = {
  id: string;
  candidate_id: string;
  publication_id: string;
  input_mode: InputMode;
  opportunity_id: string | null;
  finding: string;
  evidence_quote: string;
  customer: string;
  customer_quote: string;
  why_now: string | null;
  why_now_quote: string | null;
  current_alternative: string | null;
  alternative_quote: string | null;
};

async function loadRun(db: SqlDatabase, pipelineRunId: string): Promise<RunRow> {
  const row = await db
    .prepare(
      `SELECT pr.id, pr.candidate_id, c.publication_id, e.input_mode, o.id AS opportunity_id,
              c.finding, c.evidence_quote, c.customer, c.customer_quote, c.why_now,
              c.why_now_quote, c.current_alternative, c.alternative_quote
       FROM pipeline_run pr
       JOIN candidate c ON c.id = pr.candidate_id
       JOIN extraction_result e ON e.id = c.extraction_result_id
       LEFT JOIN opportunity o ON o.candidate_id = c.id
       WHERE pr.id = ?`,
    )
    .bind(pipelineRunId)
    .first<RunRow>();
  if (row === null) {
    throw new Error(`no pipeline run ${pipelineRunId}`);
  }
  return row;
}

const AGENT_STEP_OF = Object.fromEntries(
  Object.entries(STEP_AGENTS).map(([step, agent]) => [agent, step]),
) as Record<string, AgentStepName>;

/** The stored outputs of this run's completed agent steps, by step name. */
async function previousOutputs(
  db: SqlDatabase,
  pipelineRunId: string,
): Promise<Partial<Record<AgentStepName, unknown>>> {
  const { results } = await db
    .prepare("SELECT agent, output_json FROM agent_output WHERE pipeline_run_id = ?")
    .bind(pipelineRunId)
    .all<{ agent: string; output_json: string }>();
  const outputs: Partial<Record<AgentStepName, unknown>> = {};
  for (const row of results) {
    const step = AGENT_STEP_OF[row.agent];
    if (step) {
      outputs[step] = JSON.parse(row.output_json) as unknown;
    }
  }
  return outputs;
}

async function isComplete(db: SqlDatabase, pipelineRunId: string, step: string): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT status FROM pipeline_step WHERE pipeline_run_id = ? AND step_name = ? AND status = 'complete'",
    )
    .bind(pipelineRunId, step)
    .first<{ status: string }>();
  return row !== null;
}

function completeStepStatement(
  deps: CandidatePipelineDeps,
  pipelineRunId: string,
  step: string,
  note: string | null,
): SqlStatement {
  return deps.Db.prepare(
    `INSERT INTO pipeline_step (id, pipeline_run_id, step_name, status, attempt, completed_at, error_json)
     VALUES (?, ?, ?, 'complete', 1, ?, ?)
     ON CONFLICT (pipeline_run_id, step_name) DO UPDATE SET status = 'complete',
       completed_at = excluded.completed_at, error_json = excluded.error_json`,
  ).bind(
    `ps_${deps.NewId()}`,
    pipelineRunId,
    step,
    deps.Now(),
    note === null ? null : JSON.stringify({ Note: note }),
  );
}

async function failStep(
  deps: CandidatePipelineDeps,
  pipelineRunId: string,
  step: string,
  error: unknown,
): Promise<void> {
  // The message only, shortened: an error names a field or a rule, never publication text.
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
  await deps.Db.prepare(
    `INSERT INTO pipeline_step (id, pipeline_run_id, step_name, status, attempt, error_json)
     VALUES (?, ?, ?, 'failed', 1, ?)
     ON CONFLICT (pipeline_run_id, step_name) DO UPDATE SET status = 'failed',
       attempt = pipeline_step.attempt + 1, error_json = excluded.error_json`,
  )
    .bind(`ps_${deps.NewId()}`, pipelineRunId, step, JSON.stringify({ Error: message }))
    .run();
}

function candidateOf(run: RunRow): ExtractionCandidate {
  return {
    Finding: run.finding,
    EvidenceQuote: run.evidence_quote,
    Customer: run.customer,
    CustomerQuote: run.customer_quote,
    WhyNow: run.why_now,
    WhyNowQuote: run.why_now_quote,
    CurrentAlternative: run.current_alternative,
    AlternativeQuote: run.alternative_quote,
  };
}

/** One agent step: run it, check its output and envelope, and store both with the evidence. */
async function agentStep(
  deps: CandidatePipelineDeps,
  run: RunRow,
  name: AgentStepName,
): Promise<{ Step: AgentStepName; Skipped: boolean }> {
  if (await isComplete(deps.Db, run.id, name)) {
    // A completed step is never repeated (REQ-AGENT-007 AC2).
    return { Step: name, Skipped: true };
  }
  const step = deps.Steps[name];
  const input: AgentStepInput = {
    PipelineRunId: run.id,
    CandidateId: run.candidate_id,
    PublicationId: run.publication_id,
    InputMode: run.input_mode,
    Candidate: candidateOf(run),
    Previous: await previousOutputs(deps.Db, run.id),
  };
  try {
    const result = await step.run(input);
    const envelope = agentEnvelopeSchema(AGENT_OUTPUT_SCHEMAS[name]).parse({
      SchemaVersion: ENVELOPE_SCHEMA_VERSION,
      Agent: step.Agent,
      RunId: run.id,
      PublicationId: run.publication_id,
      CandidateId: run.candidate_id,
      Model: result.Model,
      PromptVersion: result.PromptVersion,
      InputMode: run.input_mode,
      OutputMode: "json-schema",
      Attempts: result.Attempts,
      Repairs: [],
      Output: result.Output,
      Evidence: result.Evidence,
    });
    const outputId = `ao_${deps.NewId()}`;
    const now = deps.Now();
    await deps.Db.batch([
      deps.Db.prepare(
        `INSERT INTO agent_output (id, pipeline_run_id, candidate_id, agent, envelope_json, output_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        outputId,
        run.id,
        run.candidate_id,
        step.Agent,
        JSON.stringify(envelope),
        JSON.stringify(envelope.Output),
        now,
      ),
      ...envelope.Evidence.map((item) =>
        deps.Db.prepare(
          `INSERT INTO evidence (id, agent_output_id, field, kind, quote, publication_id, url, note, retrieved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          `ev_${deps.NewId()}`,
          outputId,
          item.Field,
          item.Kind,
          item.Quote,
          item.PublicationId,
          item.Url,
          item.Note,
          item.RetrievedAt,
        ),
      ),
      completeStepStatement(deps, run.id, name, null),
    ]);
    return { Step: name, Skipped: false };
  } catch (error) {
    await failStep(deps, run.id, name, error);
    throw error;
  }
}

/** The scoring step: the placeholder score model over the stored outputs (ADR 0117). */
async function scoringStep(
  deps: CandidatePipelineDeps,
  run: RunRow,
): Promise<{ ScoreId: string | null }> {
  const db = deps.Db;
  const existing = await db
    .prepare("SELECT current_score_id FROM opportunity WHERE id = ?")
    .bind(run.opportunity_id)
    .first<{ current_score_id: string | null }>();
  if (await isComplete(db, run.id, "scoring")) {
    return { ScoreId: existing?.current_score_id ?? null };
  }
  const model = await db
    .prepare(
      "SELECT id, weights_json, currency_rates_json FROM score_model WHERE version = 'placeholder-0'",
    )
    .first<{ id: string; weights_json: string; currency_rates_json: string }>();
  if (model === null || run.opportunity_id === null) {
    throw new Error("scoring needs the placeholder-0 score model and the run's opportunity");
  }
  const now = deps.Now();
  const derived = deriveCategories(
    await previousOutputs(db, run.id),
    JSON.parse(model.currency_rates_json) as Record<string, number>,
  );
  if (!derived.Ok) {
    // No score: the opportunity stays incomplete (scoring.md, REQ-SCORE-005).
    await db.batch([
      completeStepStatement(deps, run.id, "scoring", derived.Reason),
      db
        .prepare(
          "UPDATE pipeline_run SET status = 'incomplete', ended_at = ? WHERE id = ? AND status = 'running'",
        )
        .bind(now, run.id),
    ]);
    return { ScoreId: null };
  }
  const weighted = weightedScore(
    derived.Categories,
    JSON.parse(model.weights_json) as Record<string, number>,
  );
  const scoreId = `sc_${deps.NewId()}`;
  await db.batch([
    db
      .prepare(
        `INSERT INTO score (id, opportunity_id, score_model_id, categories_json, explanation_json,
           weighted_sum, final_score, band, estimate_based, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        scoreId,
        run.opportunity_id,
        model.id,
        JSON.stringify(derived.Categories),
        JSON.stringify(derived.Explanation),
        weighted.WeightedSum,
        weighted.FinalScore,
        weighted.Band,
        derived.EstimateBased ? 1 : 0,
        now,
      ),
    // A retracted publication may have hidden the opportunity meanwhile; it stays hidden.
    db
      .prepare(
        `UPDATE opportunity SET current_score_id = ?, updated_at = ?,
           pipeline_status = CASE WHEN pipeline_status = 'hidden' THEN 'hidden' ELSE 'complete' END
         WHERE id = ?`,
      )
      .bind(scoreId, now, run.opportunity_id),
    completeStepStatement(deps, run.id, "scoring", null),
    db
      .prepare(
        "UPDATE pipeline_run SET status = 'complete', ended_at = ? WHERE id = ? AND status = 'running'",
      )
      .bind(now, run.id),
  ]);
  return { ScoreId: scoreId };
}

/**
 * The candidate pipeline (REQ-PROC-007, orchestration.md): Research Analyst, then Problem
 * Discovery, then Market Analysis, Competition, and Relevance in parallel, then the Startup
 * Generator, then scoring. Each is a durable step keyed by (`pipeline_run_id`, `step_name`). A
 * step that fails is recorded and rethrown, so the Workflow retries it; the opportunity stays
 * incomplete until scoring completes (REQ-AGENT-007 AC4).
 */
export async function runCandidatePipeline(
  deps: CandidatePipelineDeps,
  step: StepRunner,
  params: CandidateRunParams,
): Promise<CandidatePipelineOutcome> {
  const run = await loadRun(deps.Db, params.PipelineRunId);
  const agent = (name: AgentStepName) => step.do(name, () => agentStep(deps, run, name));
  await agent("research_analyst");
  await agent("problem_discovery");
  await Promise.all([agent("market_analysis"), agent("competition"), agent("relevance")]);
  await agent("startup_generator");
  const scored = await step.do("scoring", () => scoringStep(deps, run));
  deps.Log?.("candidate.pipeline_done", {
    pipelineRunId: run.id,
    candidateId: run.candidate_id,
    scored: scored.ScoreId !== null,
  });
  return {
    PipelineRunId: run.id,
    Status: scored.ScoreId === null ? "incomplete" : "complete",
    ScoreId: scored.ScoreId,
  };
}
