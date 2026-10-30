import {
  matchPublicationIdentifiers,
  titleAuthorReviewKey,
  type DedupeIdentifiers,
  type DedupeMatch,
} from "@roi/models";

export type MergeDecision =
  | { Action: "merge"; Match: Exclude<DedupeMatch, { Kind: "none" }> }
  | { Action: "review"; ReviewKey: string }
  | { Action: "create" };

/**
 * Decide how an incoming source record relates to an existing publication
 * (REQ-DATA-007). Title+first-author alone never auto-merges.
 */
export function decideMerge(options: {
  Incoming: DedupeIdentifiers;
  Existing: DedupeIdentifiers;
  IncomingTitle: string;
  IncomingFirstAuthor: string;
  ExistingTitle: string;
  ExistingFirstAuthor: string;
}): MergeDecision {
  const match = matchPublicationIdentifiers(options.Incoming, options.Existing);
  if (match.Kind !== "none") {
    return { Action: "merge", Match: match };
  }

  const incomingKey = titleAuthorReviewKey(options.IncomingTitle, options.IncomingFirstAuthor);
  const existingKey = titleAuthorReviewKey(options.ExistingTitle, options.ExistingFirstAuthor);
  if (incomingKey === existingKey && incomingKey !== "|") {
    return { Action: "review", ReviewKey: incomingKey };
  }

  return { Action: "create" };
}
