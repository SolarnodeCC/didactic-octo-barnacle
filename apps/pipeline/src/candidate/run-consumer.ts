import { QueueMessageEnvelopeSchema } from "@roi/models";

import { claimMessage, completeStatement, markFailed } from "../queue/log.js";
import { type PipelineDeps } from "../queue/deps.js";

export type CandidateRunOutcome =
  "started" | "already-scored" | "hidden" | "no-candidate" | "duplicate" | "dead-lettered";

/**
 * Consumer of `candidate.run` (REQ-PROC-007, ADR 0053, ADR 0117). It writes the candidate's
 * pipeline run and its opportunity, `incomplete` until scored, and starts one Workflow instance
 * with the run's ID. One opportunity per candidate (ADR 0015): a scored candidate is not run
 * again, and a hidden or retracted one is not run. The pipeline run ID is fixed per candidate,
 * so a retried message starts the same instance.
 */
export async function handleCandidateRun(
  deps: PipelineDeps,
  body: unknown,
): Promise<CandidateRunOutcome> {
  const envelope = QueueMessageEnvelopeSchema.parse(body);
  const claim = await claimMessage(deps.Db, envelope, deps.Now());
  if (claim !== "claimed") {
    return claim;
  }
  const db = deps.Db;
  try {
    const candidateId = envelope.Ids.CandidateId;
    if (envelope.Type !== "candidate.run" || candidateId === undefined) {
      throw new Error("candidate.run needs a CandidateId");
    }
    if (!deps.Candidate) {
      throw new Error("the candidate Workflow is not bound in this Worker");
    }
    const complete = async (note: string) => {
      await db.batch([completeStatement(db, envelope.MessageId, deps.Now(), note)]);
    };
    const candidate = await db
      .prepare(
        `SELECT c.id, c.hidden_reason, p.retracted, o.pipeline_status
         FROM candidate c JOIN publication p ON p.id = c.publication_id
         LEFT JOIN opportunity o ON o.candidate_id = c.id
         WHERE c.id = ?`,
      )
      .bind(candidateId)
      .first<{
        id: string;
        hidden_reason: string | null;
        retracted: number;
        pipeline_status: string | null;
      }>();
    if (candidate === null) {
      await complete("no such candidate");
      return "no-candidate";
    }
    if (candidate.hidden_reason !== null || candidate.retracted === 1) {
      await complete("hidden");
      return "hidden";
    }
    if (candidate.pipeline_status === "complete") {
      await complete("already scored");
      return "already-scored";
    }
    const now = deps.Now();
    const pipelineRunId = `pr_${candidateId}`;
    await db.batch([
      db
        .prepare(
          `INSERT INTO pipeline_run (id, candidate_id, processing_run_id, status, started_at)
           VALUES (?, ?, ?, 'running', ?) ON CONFLICT (id) DO NOTHING`,
        )
        .bind(pipelineRunId, candidateId, envelope.Ids.RunId ?? null, now),
      db
        .prepare(
          `INSERT INTO opportunity (id, candidate_id, pipeline_status, created_at, updated_at)
           VALUES (?, ?, 'incomplete', ?, ?) ON CONFLICT (candidate_id) DO NOTHING`,
        )
        .bind(`opp_${deps.NewId()}`, candidateId, now, now),
    ]);
    await deps.Candidate.Workflow.create({
      id: pipelineRunId,
      params: { PipelineRunId: pipelineRunId },
    });
    await complete("started");
    deps.Log?.("candidate.started", { candidateId, pipelineRunId });
    return "started";
  } catch (error) {
    await markFailed(db, envelope.MessageId, error, deps.Now());
    throw error;
  }
}
