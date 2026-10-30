import { fetchWithBackoff, type BackoffOptions, type FetchFn } from "../http/retry.js";

export type GithubConfig = {
  /** `owner/repo`; the token can only create and comment on issues (REQ-NFR-019 AC5). */
  Repo: string;
  Token: string;
};

export type EmailConfig = { ApiKey: string; From: string; To: string };

type Deps = { Fetch: FetchFn; Backoff: BackoffOptions };

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function githubHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "content-type": "application/json",
    "user-agent": "roi-pipeline-alerts",
  };
}

function assertRepo(repo: string): void {
  if (!REPO_PATTERN.test(repo)) {
    throw new Error("ALERT_GITHUB_REPO must look like owner/repo");
  }
}

/** Opens an issue with the label `alert` and returns its number. */
export async function createAlertIssue(
  config: GithubConfig,
  deps: Deps,
  issue: { Title: string; Body: string },
): Promise<number> {
  assertRepo(config.Repo);
  const response = await fetchWithBackoff(
    deps.Fetch,
    `https://api.github.com/repos/${config.Repo}/issues`,
    {
      method: "POST",
      headers: githubHeaders(config.Token),
      body: JSON.stringify({ title: issue.Title, body: issue.Body, labels: ["alert"] }),
    },
    deps.Backoff,
  );
  const created = (await response.json()) as { number?: number };
  if (typeof created.number !== "number") {
    throw new Error("GitHub did not return an issue number");
  }
  return created.number;
}

export async function commentOnAlertIssue(
  config: GithubConfig,
  deps: Deps,
  issueNumber: number,
  body: string,
): Promise<void> {
  assertRepo(config.Repo);
  await fetchWithBackoff(
    deps.Fetch,
    `https://api.github.com/repos/${config.Repo}/issues/${issueNumber}/comments`,
    { method: "POST", headers: githubHeaders(config.Token), body: JSON.stringify({ body }) },
    deps.Backoff,
  );
}

/** Plain text only: no HTML, no tracking (docs/kt/requirements/accounts.md, REQ-ACC-007). */
export async function sendAlertEmail(
  config: EmailConfig,
  deps: Deps,
  email: { Subject: string; Text: string },
): Promise<void> {
  await fetchWithBackoff(
    deps.Fetch,
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.ApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.From,
        to: [config.To],
        subject: email.Subject,
        text: email.Text,
      }),
    },
    deps.Backoff,
  );
}
