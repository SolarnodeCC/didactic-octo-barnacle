import { describe, expect, it } from "vitest";

import { QueueMessageEnvelopeSchema } from "./queue-message.js";

describe("REQ-DATA-011: typed queue envelopes carry IDs only", () => {
  it("REQ-DATA-011: accepts a typed envelope with schema version and IDs", () => {
    const parsed = QueueMessageEnvelopeSchema.parse({
      MessageId: "msg_1",
      Type: "pdf-fetch",
      SchemaVersion: "1",
      PublicationId: "pub_1",
      SourceRecordId: "src_1",
      RunId: "run_1",
    });
    expect(parsed.Type).toBe("pdf-fetch");
  });

  it("REQ-DATA-011: rejects an unknown message type", () => {
    expect(() =>
      QueueMessageEnvelopeSchema.parse({
        MessageId: "msg_1",
        Type: "bulk-payload",
        SchemaVersion: "1",
      }),
    ).toThrow();
  });
});
