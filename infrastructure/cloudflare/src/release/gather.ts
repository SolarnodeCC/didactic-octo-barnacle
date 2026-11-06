import { execFileSync } from "node:child_process";

import { isContractMigration, type Change, type PlanInput, type StagingDeploy } from "./plan.js";

/**
 * Collects the input of `planRelease` with `git` and `gh` (REQ-NFR-020, ADR 0044). Arguments go
 * to `execFileSync` as arrays, never through a shell. `GH_TOKEN` is read by `gh` itself.
 */
const MAX_CHANGES = 200;
const CHECKS = ["parse", "toolchain"] as const;

function run(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

function api<T>(repo: string, path: string): T {
  return JSON.parse(run("gh", ["api", `repos/${repo}/${path}`])) as T;
}

function lastReleaseTag(): string | null {
  try {
    return run("git", ["describe", "--tags", "--match", "release-*", "--abbrev=0", "origin/main"]);
  } catch {
    return null;
  }
}

function unreleasedShas(tag: string | null): string[] {
  const range = tag ? [`${tag}..origin/main`] : ["origin/main"];
  const out = run("git", [
    "rev-list",
    "--first-parent",
    "--reverse",
    `--max-count=${MAX_CHANGES}`,
    ...range,
  ]);
  return out ? out.split("\n") : [];
}

function contractMigration(sha: string): boolean {
  const files = run("git", [
    "diff-tree",
    "--no-commit-id",
    "--name-only",
    "--diff-filter=A",
    "-r",
    "-m",
    "--first-parent",
    sha,
    "--",
    "infrastructure/cloudflare/migrations",
  ]);
  return files
    .split("\n")
    .filter((file) => file.endsWith(".sql"))
    .some((file) => isContractMigration(run("git", ["show", `${sha}:${file}`])));
}

function checksGreen(repo: string, sha: string): boolean {
  return CHECKS.every((name) => {
    const body = api<{
      check_runs: Array<{ conclusion: string | null; completed_at: string | null }>;
    }>(repo, `commits/${sha}/check-runs?check_name=${name}&filter=latest`);
    const latest = [...body.check_runs]
      .sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? ""))
      .pop();
    return latest?.conclusion === "success";
  });
}

function changeFor(repo: string, sha: string): Change {
  const pulls = api<
    Array<{
      number: number;
      title: string;
      body: string | null;
      merged_at: string | null;
      labels: Array<{ name: string }>;
    }>
  >(repo, `commits/${sha}/pulls`);
  const pull = pulls.find((candidate) => candidate.merged_at !== null);
  return {
    Sha: sha,
    PrNumber: pull?.number ?? null,
    Title: pull?.title ?? run("git", ["log", "-1", "--format=%s", sha]),
    Labels: pull?.labels.map((label) => label.name) ?? [],
    Body: pull?.body ?? "",
    ChecksGreen: checksGreen(repo, sha),
    ContractMigration: contractMigration(sha),
  };
}

type Run = { id: number; head_sha: string };
type Job = { name: string; conclusion: string | null; completed_at: string | null };

/** A staging deploy is a successful job `deploy` in `Staging pipeline` or in `Staging deploy`. */
function stagingDeploys(repo: string): StagingDeploy[] {
  const deploys: StagingDeploy[] = [];
  for (const workflow of ["staging-pipeline.yml", "staging-deploy.yml"]) {
    const runs = api<{ workflow_runs: Run[] }>(
      repo,
      `actions/workflows/${workflow}/runs?branch=main&status=success&per_page=30`,
    ).workflow_runs;
    for (const workflowRun of runs) {
      const jobs = api<{ jobs: Job[] }>(
        repo,
        `actions/runs/${workflowRun.id}/jobs?per_page=100`,
      ).jobs;
      const deploy = jobs.find(
        (job) => /^deploy( \/ deploy)?$/.test(job.name) && job.conclusion === "success",
      );
      if (deploy?.completed_at)
        deploys.push({ Sha: workflowRun.head_sha, At: deploy.completed_at });
    }
  }
  return deploys;
}

export function gatherPlanInput(repo: string, soakHours: number): PlanInput {
  const shas = unreleasedShas(lastReleaseTag());
  const open = api<Array<{ number: number }>>(repo, "pulls?state=open&per_page=100");
  const alerts = api<Array<{ number: number; pull_request?: unknown }>>(
    repo,
    "issues?labels=alert&state=open&per_page=100",
  ).filter((issue) => issue.pull_request === undefined);
  return {
    Changes: shas.map((sha) => changeFor(repo, sha)),
    StagingDeploys: stagingDeploys(repo),
    OpenPrNumbers: open.map((pull) => pull.number),
    OpenAlerts: alerts.length,
    Now: new Date().toISOString(),
    SoakHours: soakHours,
  };
}
