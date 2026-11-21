import { type TriageReason } from "@roi/models";

import {
  isArxivCategoryInScope,
  isOpenAlexTopicsInScope,
  SCOPE_ARXIV_CATEGORIES,
  SCOPE_OPENALEX_TOPIC_NAMES,
} from "../normalize/scope.js";

/** What the rules read of a stored publication. */
export type TriageCandidate = {
  Completeness: string;
  Retracted: boolean;
  /** OpenAlex topic, field, and subfield names and arXiv categories (`publication.topics_json`). */
  Topics: string[];
};

export type RuleReason = Extract<TriageReason, "incomplete" | "retracted" | "out-of-scope">;

/**
 * The rules that decide before any model call, so rejected publications cost nothing
 * (REQ-PROC-005 AC1, REQ-PROC-006 AC1, docs/kt/agents/triage.md). Scope is the scope of
 * ingestion: a publication with a topic or category of the topic map is in scope, the
 * cross-industry categories included; the industry is assigned later by Relevance (ADR 0038).
 * Returns null when the publication goes to the model.
 */
export function ruleReason(publication: TriageCandidate): RuleReason | null {
  if (publication.Retracted) {
    return "retracted";
  }
  if (publication.Completeness !== "complete") {
    return "incomplete";
  }
  const inScope =
    isArxivCategoryInScope(publication.Topics, SCOPE_ARXIV_CATEGORIES) ||
    isOpenAlexTopicsInScope(publication.Topics, SCOPE_OPENALEX_TOPIC_NAMES);
  return inScope ? null : "out-of-scope";
}
