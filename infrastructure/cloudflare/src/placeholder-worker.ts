/**
 * Placeholder entry so Wrangler can validate the configuration before
 * apps/pipeline owns the real collector Worker.
 */
export default {
  async fetch(): Promise<Response> {
    return new Response("roi-pipeline placeholder", { status: 200 });
  },
};
