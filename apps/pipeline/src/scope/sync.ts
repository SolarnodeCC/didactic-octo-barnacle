import type { LookupReport } from "./lookup.js";

export type SubfieldIdChange = { Name: string; From: string; To: string };

export type SyncPlan = {
  /** Names whose single exact subfield ID in OpenAlex differs from the checked-in ID. */
  Changes: SubfieldIdChange[];
  /** Names that cannot be synced safely (no exact match, or more than one). A human decides. */
  Skipped: Array<{ Name: string; Reason: string }>;
};

/**
 * Compares a lookup report with the checked-in `OPENALEX_SUBFIELD_IDS` (REQ-DATA-001). Only
 * the ID of a name that is already in the map can change. Names are never added or removed and
 * volumes are ignored, because the choice of scope is a reviewed decision (ADR 0038, ADR 0041).
 */
export function planSubfieldSync(
  report: LookupReport,
  current: Readonly<Record<string, string>>,
): SyncPlan {
  const plan: SyncPlan = { Changes: [], Skipped: [] };
  for (const topic of report.Topics) {
    const known = current[topic.TopicName];
    if (known === undefined) continue;
    const exact = [
      ...new Set(
        topic.Candidates.filter((c) => c.Level === "subfield" && c.Exact).map((c) => c.Id),
      ),
    ];
    if (exact.length === 0) {
      plan.Skipped.push({ Name: topic.TopicName, Reason: "no exact subfield match" });
    } else if (exact.length > 1) {
      plan.Skipped.push({
        Name: topic.TopicName,
        Reason: `more than one exact match: ${exact.join(", ")}`,
      });
    } else if (exact[0] !== known) {
      plan.Changes.push({ Name: topic.TopicName, From: known, To: exact[0] as string });
    }
  }
  return plan;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Rewrites the ID of each changed name in the source of `normalize/scope.ts`. */
export function applySubfieldChanges(source: string, changes: readonly SubfieldIdChange[]): string {
  let result = source;
  for (const change of changes) {
    const entry = new RegExp(
      `("${escapeRegExp(change.Name)}"|${escapeRegExp(change.Name)}):\\s*"${escapeRegExp(change.From)}"`,
    );
    if (!entry.test(result)) {
      throw new Error(`Entry for "${change.Name}" with ID ${change.From} not found`);
    }
    result = result.replace(entry, (_match, key: string) => `${key}: "${change.To}"`);
  }
  return result;
}

export function formatSyncPlan(plan: SyncPlan): string {
  const lines = ["## OpenAlex subfield ID sync", ""];
  if (plan.Changes.length === 0) lines.push("No subfield ID changed.");
  else {
    lines.push("| Name | Old ID | New ID |", "|---|---|---|");
    for (const c of plan.Changes)
      lines.push(`| ${c.Name.replace(/\|/g, "/")} | ${c.From} | ${c.To} |`);
  }
  if (plan.Skipped.length > 0) {
    lines.push("", "Not synced, needs a human:");
    for (const s of plan.Skipped) lines.push(`- ${s.Name}: ${s.Reason}`);
  }
  return `${lines.join("\n")}\n`;
}
