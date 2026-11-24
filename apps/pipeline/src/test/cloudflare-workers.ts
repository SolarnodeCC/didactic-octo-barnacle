/**
 * Stands in for the Workers runtime module `cloudflare:workers` under vitest, which runs in
 * Node (vitest.config.ts alias). Only the Workflow base class is needed.
 */
export class WorkflowEntrypoint<Env = unknown> {
  protected ctx: unknown;
  protected env: Env;

  constructor(ctx: unknown, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}
