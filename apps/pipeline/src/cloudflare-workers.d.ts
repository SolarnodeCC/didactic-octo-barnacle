/**
 * The slice of the Workers runtime module `cloudflare:workers` the pipeline uses: the base class
 * of a Workflow (ADR 0003, ADR 0116). Hand-written, as the other binding interfaces are, until
 * `@cloudflare/workers-types` is needed (docs/kt/phase-2/dependencies.md). Tests resolve the
 * module to `src/test/cloudflare-workers.ts`.
 */
declare module "cloudflare:workers" {
  export abstract class WorkflowEntrypoint<Env = unknown, Params = unknown> {
    protected ctx: unknown;
    protected env: Env;
    constructor(ctx: unknown, env: Env);
    abstract run(
      event: { payload: Readonly<Params>; timestamp: Date; instanceId: string },
      step: { do<T>(name: string, callback: () => Promise<T>): Promise<T> },
    ): Promise<unknown>;
  }
}
