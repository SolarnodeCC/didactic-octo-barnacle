import {
  ProviderCallError,
  fakeEmbedding,
  type WorkersAiBinding,
  type WorkersAiRunOptions,
} from "@roi/models";

import { type VirtualClock } from "./virtual-clock.js";

/** How one model behaves under load: its latency and its request limit (ADR 0118). */
export type ModelProfile = {
  /** Latency of one call in seconds: drawn evenly between the median and the 95th percentile. */
  P50Seconds: number;
  P95Seconds: number;
  /** Requests a minute the account may send this model; more are answered with 429. */
  RequestsPerMinute: number;
};

export type ModelAnswer = (inputs: Record<string, unknown>) => unknown;

export type ModelStats = { Calls: number; RateLimited: number; Busy: number; PeakBusy: number };

/** A small seeded generator (mulberry32), so a load run repeats exactly. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * A Workers AI binding on the virtual clock. Each model has a latency profile and a request limit
 * per minute over a sliding window; a call over the limit is answered with 429 and a
 * `Retry-After`, as Workers AI does, so `callModel` waits and retries on the same clock. Chat
 * models answer through `answer`; embedding models get the deterministic `fakeEmbedding`.
 */
export class TimedWorkersAi implements WorkersAiBinding {
  aiGatewayLogId: string | null = null;
  readonly Stats = new Map<string, ModelStats>();
  private readonly window = new Map<string, number[]>();
  private readonly random: () => number;

  constructor(
    private readonly clock: VirtualClock,
    private readonly profiles: Record<string, ModelProfile>,
    private readonly answers: Record<string, ModelAnswer>,
    seed: number,
  ) {
    this.random = seededRandom(seed);
  }

  private stats(model: string): ModelStats {
    let stats = this.Stats.get(model);
    if (!stats) {
      stats = { Calls: 0, RateLimited: 0, Busy: 0, PeakBusy: 0 };
      this.Stats.set(model, stats);
    }
    return stats;
  }

  async run(
    model: string,
    inputs: Record<string, unknown>,
    _options: WorkersAiRunOptions,
  ): Promise<unknown> {
    const profile = this.profiles[model];
    if (!profile) {
      throw new Error(`no load profile for ${model}`);
    }
    const stats = this.stats(model);
    stats.Calls += 1;
    this.aiGatewayLogId = `load_${stats.Calls}`;
    const now = this.clock.nowMs();
    const recent = (this.window.get(model) ?? []).filter((at) => at > now - 60_000);
    if (recent.length >= profile.RequestsPerMinute) {
      stats.RateLimited += 1;
      this.window.set(model, recent);
      const oldest = recent[0] ?? now;
      throw new ProviderCallError(
        "rate limited",
        429,
        Math.max(1, Math.ceil((oldest + 60_000 - now) / 1000)),
      );
    }
    recent.push(now);
    this.window.set(model, recent);
    stats.Busy += 1;
    stats.PeakBusy = Math.max(stats.PeakBusy, stats.Busy);
    const seconds = profile.P50Seconds + (profile.P95Seconds - profile.P50Seconds) * this.random();
    await this.clock.sleep(seconds * 1000);
    stats.Busy -= 1;
    const texts = Array.isArray(inputs.text) ? (inputs.text as string[]) : null;
    if (texts) {
      const data = texts.map((text) => fakeEmbedding(text));
      return { shape: [data.length, data[0]?.length ?? 0], data };
    }
    const answer = this.answers[model];
    if (!answer) {
      throw new Error(`no load answer for ${model}`);
    }
    return { response: answer(inputs), usage: { prompt_tokens: 600, completion_tokens: 120 } };
  }
}
