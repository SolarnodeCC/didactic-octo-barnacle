/**
 * Plans the weekly production release (REQ-NFR-020, ADR 0044). `main` is linear, so a release
 * is always a prefix of the commits that are not released yet: everything up to a chosen SHA
 * ships together. The plan picks the longest prefix in which every change is safe to ship and
 * names what it holds back and why. It reads no network; `gather.ts` supplies the input.
 */
export type Change = {
  Sha: string;
  /** The merged pull request of the commit, or null for a commit that was pushed directly. */
  PrNumber: number | null;
  Title: string;
  Labels: readonly string[];
  Body: string;
  /** `parse` and `toolchain` succeeded for this commit. */
  ChecksGreen: boolean;
  /** The commit adds a migration that drops or renames something (expand/contract). */
  ContractMigration: boolean;
};

export type StagingDeploy = { Sha: string; At: string };

export type PlanInput = {
  /** Unreleased commits of `main`, oldest first. */
  Changes: readonly Change[];
  /** Successful staging deployments. A deploy of a commit also covers every older commit. */
  StagingDeploys: readonly StagingDeploy[];
  /** Pull requests that are still open; a dependency on one of them cannot be released. */
  OpenPrNumbers: readonly number[];
  /** Open issues labeled `alert`. */
  OpenAlerts: number;
  Now: string;
  SoakHours: number;
};

export type Deferred = { Sha: string; PrNumber: number | null; Reason: string };

export type ReleasePlan = {
  /** The commit to release, or null when there is nothing to release. */
  Sha: string | null;
  Included: Change[];
  Deferred: Deferred[];
  Summary: string;
};

const DEPENDS_ON = /\bdepends[ -]on\s+#(\d+)/gi;

/** The pull requests a change depends on: `Depends on #N` in the body or a `depends-on:N` label. */
export function dependenciesOf(change: Pick<Change, "Body" | "Labels">): number[] {
  const numbers = new Set<number>();
  for (const match of change.Body.matchAll(DEPENDS_ON)) numbers.add(Number(match[1]));
  for (const label of change.Labels) {
    const match = /^depends-on:(\d+)$/i.exec(label);
    if (match) numbers.add(Number(match[1]));
  }
  return [...numbers];
}

/** True for SQL that drops or renames a table, column, or index. */
export function isContractMigration(sql: string): boolean {
  return /\b(DROP\s+(TABLE|COLUMN|INDEX|VIEW)|RENAME\s+(TO|COLUMN))\b/i.test(sql);
}

function blocker(
  change: Change,
  index: number,
  input: PlanInput,
  positionOfPr: Map<number, number>,
): string | null {
  if (change.Labels.includes("hold")) return "labeled `hold`";
  if (!change.ChecksGreen) return "checks `parse` and `toolchain` are not both green";
  if (change.ContractMigration && !change.Labels.includes("contract-ok")) {
    return "drops or renames in a migration; add the label `contract-ok` once no released code uses it";
  }
  for (const dependency of dependenciesOf(change)) {
    if (input.OpenPrNumbers.includes(dependency))
      return `depends on #${dependency}, which is still open`;
    const position = positionOfPr.get(dependency);
    if (position !== undefined && position >= index) {
      return `depends on #${dependency}, which comes later on main`;
    }
  }
  return null;
}

export function planRelease(input: PlanInput): ReleasePlan {
  const { Changes: changes } = input;
  const defer = (from: number, firstReason: string): Deferred[] =>
    changes.slice(from).map((change, offset) => ({
      Sha: change.Sha,
      PrNumber: change.PrNumber,
      Reason: offset === 0 ? firstReason : "behind a change that is held back",
    }));

  if (changes.length === 0) {
    return { Sha: null, Included: [], Deferred: [], Summary: "Nothing to release." };
  }
  if (input.OpenAlerts > 0) {
    return {
      Sha: null,
      Included: [],
      Deferred: defer(0, "an issue labeled `alert` is open"),
      Summary: `No release: ${input.OpenAlerts} open alert issue(s).`,
    };
  }

  const cutoff = new Date(input.Now).getTime() - input.SoakHours * 60 * 60 * 1000;
  let soakedUpTo = -1;
  for (const deploy of input.StagingDeploys) {
    const position = changes.findIndex((change) => change.Sha === deploy.Sha);
    if (position >= 0 && new Date(deploy.At).getTime() <= cutoff) {
      soakedUpTo = Math.max(soakedUpTo, position);
    }
  }

  const positionOfPr = new Map<number, number>();
  changes.forEach((change, index) => {
    if (change.PrNumber !== null) positionOfPr.set(change.PrNumber, index);
  });

  let end = 0;
  let reason = `not on staging for ${input.SoakHours} hours yet`;
  while (end <= soakedUpTo) {
    const found = blocker(changes[end] as Change, end, input, positionOfPr);
    if (found) {
      reason = found;
      break;
    }
    end += 1;
    reason = `not on staging for ${input.SoakHours} hours yet`;
  }

  if (end === 0) {
    return {
      Sha: null,
      Included: [],
      Deferred: defer(0, reason),
      Summary: `No release: the oldest change is held back (${reason}).`,
    };
  }
  const included = changes.slice(0, end);
  const last = included[included.length - 1] as Change;
  return {
    Sha: last.Sha,
    Included: included,
    Deferred: defer(end, reason),
    Summary: `Release ${last.Sha.slice(0, 7)} with ${included.length} change(s); ${changes.length - end} held back.`,
  };
}

export function formatPlan(plan: ReleasePlan): string {
  const label = (change: { PrNumber: number | null; Sha: string }): string =>
    change.PrNumber === null ? change.Sha.slice(0, 7) : `#${change.PrNumber}`;
  const lines = ["## Production release plan", "", plan.Summary, ""];
  if (plan.Included.length > 0) {
    lines.push("Included:");
    for (const change of plan.Included) lines.push(`- ${label(change)} ${change.Title}`);
    lines.push("");
  }
  if (plan.Deferred.length > 0) {
    lines.push("Held back:");
    for (const item of plan.Deferred) lines.push(`- ${label(item)}: ${item.Reason}`);
    lines.push("");
  }
  return `${lines.join("\n")}`;
}
