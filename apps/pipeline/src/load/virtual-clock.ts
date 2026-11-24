/**
 * A discrete-event clock for the load test (REQ-NFR-010, ADR 0118). Code under test waits only
 * through `sleep`; everything else it does is synchronous SQLite and promise chains. So when the
 * process has no pending work, the clock jumps to the next timer, and a simulated day runs in
 * seconds of real time.
 */
export class VirtualClock {
  private currentMs: number;
  private sequence = 0;
  private readonly timers: Array<{ At: number; Sequence: number; Resolve: () => void }> = [];

  constructor(startIso: string) {
    this.currentMs = Date.parse(startIso);
  }

  /** The current virtual time as an ISO string, for `PipelineDeps.Now`. */
  now(): string {
    return new Date(this.currentMs).toISOString();
  }

  nowMs(): number {
    return this.currentMs;
  }

  /** Resolves when the virtual time has moved on by `ms`. */
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.timers.push({
        At: this.currentMs + Math.max(0, ms),
        Sequence: (this.sequence += 1),
        Resolve: resolve,
      });
    });
  }

  /** Runs `task` at `iso`, or now if that time has passed. A failure is passed to `onError`. */
  at(iso: string, task: () => Promise<unknown>, onError: (error: unknown) => void): void {
    void this.sleep(Date.parse(iso) - this.currentMs)
      .then(task)
      .catch(onError);
  }

  /**
   * Advances time until no timer is left or the next one is after `untilIso`. Between timers it
   * lets the process settle, so every promise chain that does not wait on the clock completes.
   */
  async run(untilIso?: string): Promise<void> {
    const until = untilIso === undefined ? Number.POSITIVE_INFINITY : Date.parse(untilIso);
    for (;;) {
      await settle();
      if (this.timers.length === 0) {
        return;
      }
      this.timers.sort((a, b) => a.At - b.At || a.Sequence - b.Sequence);
      const next = this.timers[0];
      if (next === undefined || next.At > until) {
        return;
      }
      this.currentMs = next.At;
      const due = this.timers.filter((timer) => timer.At === next.At);
      this.timers.splice(0, due.length);
      for (const timer of due) {
        timer.Resolve();
      }
    }
  }
}

/** Lets every pending promise chain and immediate run to completion. */
async function settle(): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
