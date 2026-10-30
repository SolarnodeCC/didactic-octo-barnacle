import { describe, expect, it } from "vitest";

import { QueueMessageEnvelopeSchema } from "./queue-message.js";

const valid = {
  MessageId: "fetch:run_1:0",
  Type: "source.fetch_page",
  SchemaVersion: "1",
  Ids: { RunId: "run_1", Source: "openalex", Page: 0 },
  Attempt: 0,
};

describe("REQ-DATA-011: typed queue envelopes carry IDs only", () => {
  it("REQ-DATA-011: accepts a typed envelope with schema version, IDs, and attempt", () => {
    const parsed = QueueMessageEnvelopeSchema.parse(valid);
    expect(parsed.Type).toBe("source.fetch_page");
    expect(parsed.Ids.Page).toBe(0);
  });

  it("REQ-DATA-011: rejects an unknown message type", () => {
    expect(() => QueueMessageEnvelopeSchema.parse({ ...valid, Type: "bulk-payload" })).toThrow();
  });

  it("REQ-DATA-011: rejects a message that carries a payload next to its IDs", () => {
    expect(() =>
      QueueMessageEnvelopeSchema.parse({ ...valid, Ids: { ...valid.Ids, Abstract: "long text" } }),
    ).toThrow();
    expect(() => QueueMessageEnvelopeSchema.parse({ ...valid, Body: "x".repeat(1000) })).toThrow();
  });

  it("REQ-DATA-011: rejects an envelope without a schema version", () => {
    const { SchemaVersion: _omitted, ...withoutVersion } = valid;
    expect(() => QueueMessageEnvelopeSchema.parse(withoutVersion)).toThrow();
  });
});
