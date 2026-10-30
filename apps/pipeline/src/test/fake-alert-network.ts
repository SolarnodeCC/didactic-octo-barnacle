import { type FetchFn } from "../http/retry.js";

export type RecordedRequest = {
  url: string;
  method: string;
  headers: Headers;
  body: string;
};

export type ChannelMode = "ok" | "forbidden" | "error-once";

/**
 * GitHub and Resend in memory (REQ-TEST-003). `forbidden` answers 403, which is not
 * retried; `error-once` answers 502 once and then works, to exercise the retry.
 */
export function createAlertNetwork() {
  const requests: RecordedRequest[] = [];
  const mode = { github: "ok" as ChannelMode, email: "ok" as ChannelMode };
  const failedOnce = { github: false, email: false };
  let nextIssue = 42;

  const answer = (channel: "github" | "email", ok: () => Response): Response => {
    if (mode[channel] === "forbidden") {
      return new Response("{}", { status: 403 });
    }
    if (mode[channel] === "error-once" && !failedOnce[channel]) {
      failedOnce[channel] = true;
      return new Response("{}", { status: 502 });
    }
    return ok();
  };

  const fetchFn: FetchFn = (input, init) => {
    const url = String(input);
    requests.push({
      url,
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : "",
    });
    if (url.startsWith("https://api.github.com/")) {
      return Promise.resolve(
        answer("github", () =>
          url.endsWith("/issues")
            ? Response.json({ number: nextIssue++ }, { status: 201 })
            : Response.json({ id: 1 }, { status: 201 }),
        ),
      );
    }
    if (url === "https://api.resend.com/emails") {
      return Promise.resolve(answer("email", () => Response.json({ id: "email_1" })));
    }
    return Promise.reject(new Error(`unexpected request to ${url}`));
  };

  return {
    fetchFn,
    requests,
    mode,
    issuesCreated: () => requests.filter((r) => r.method === "POST" && r.url.endsWith("/issues")),
    comments: () => requests.filter((r) => r.url.includes("/comments")),
    emails: () => requests.filter((r) => r.url === "https://api.resend.com/emails"),
  };
}
