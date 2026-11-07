import {
  ProviderCallError,
  type WorkersAiBinding,
  type WorkersAiRunOptions,
} from "./workers-ai.js";

/**
 * A scripted Workers AI binding for tests and the benchmark dry run (WP2). Each `run` takes
 * the next reply: a recorded response, a provider error such as a 429, or malformed output.
 * It never calls a live model (REQ-TEST-002 AC2).
 */
export type FakeReply =
  | { Kind: "output"; Output: unknown; InputTokens?: number; OutputTokens?: number }
  | { Kind: "error"; Status: number | null; Message?: string; RetryAfterSeconds?: number };

export type FakeCall = {
  Model: string;
  Inputs: Record<string, unknown>;
  Options: WorkersAiRunOptions;
};

export class FakeWorkersAi implements WorkersAiBinding {
  readonly Calls: FakeCall[] = [];
  aiGatewayLogId: string | null = null;
  private readonly replies: FakeReply[];

  constructor(replies: FakeReply[]) {
    this.replies = [...replies];
  }

  /** Replies not used yet. */
  get Remaining(): number {
    return this.replies.length;
  }

  run(
    model: string,
    inputs: Record<string, unknown>,
    options: WorkersAiRunOptions,
  ): Promise<unknown> {
    this.Calls.push({ Model: model, Inputs: inputs, Options: options });
    this.aiGatewayLogId = `log_${this.Calls.length}`;
    const reply = this.replies.shift();
    if (reply === undefined) {
      return Promise.reject(new Error("FakeWorkersAi has no reply left"));
    }
    if (reply.Kind === "error") {
      return Promise.reject(
        new ProviderCallError(
          reply.Message ?? `provider error ${String(reply.Status)}`,
          reply.Status,
          reply.RetryAfterSeconds ?? null,
        ),
      );
    }
    return Promise.resolve({
      response: reply.Output,
      usage: {
        prompt_tokens: reply.InputTokens ?? 100,
        completion_tokens: reply.OutputTokens ?? 20,
      },
    });
  }
}
