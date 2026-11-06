import { describe, expect, it } from "vitest";

import { fetchPageEnvelope } from "./deps.js";
import { claimMessage, completeStatement } from "./log.js";
import { createTestDatabase } from "../test/sqlite-d1.js";

const NOW = "2026-11-06T10:00:00.000Z";

function attemptsOf(raw: ReturnType<typeof createTestDatabase>["Raw"], messageId: string) {
  return raw
    .prepare("SELECT status, attempts FROM queue_message_log WHERE message_id = ?")
    .get(messageId) as { status: string; attempts: number };
}

describe("REQ-DATA-011: a message is claimed once per delivery", () => {
  it("REQ-DATA-011: a new message is claimed and logged with one attempt", async () => {
    const { Db, Raw } = createTestDatabase();
    const envelope = fetchPageEnvelope("run-1", "openalex", 0);

    expect(await claimMessage(Db, envelope, NOW)).toBe("claimed");
    expect(attemptsOf(Raw, envelope.MessageId)).toEqual({ status: "processing", attempts: 1 });
  });

  it("REQ-DATA-011: a redelivered message that did not finish is claimed again and counts the attempt", async () => {
    const { Db, Raw } = createTestDatabase();
    const envelope = fetchPageEnvelope("run-1", "openalex", 0);
    await claimMessage(Db, envelope, NOW);

    expect(await claimMessage(Db, envelope, NOW)).toBe("claimed");
    expect(attemptsOf(Raw, envelope.MessageId)).toEqual({ status: "processing", attempts: 2 });
  });

  it("REQ-DATA-011: a completed message is a duplicate and its row is unchanged", async () => {
    const { Db, Raw } = createTestDatabase();
    const envelope = fetchPageEnvelope("run-1", "openalex", 0);
    await claimMessage(Db, envelope, NOW);
    await Db.batch([completeStatement(Db, envelope.MessageId, NOW)]);

    expect(await claimMessage(Db, envelope, NOW)).toBe("duplicate");
    expect(attemptsOf(Raw, envelope.MessageId)).toEqual({ status: "completed", attempts: 1 });
  });

  it("REQ-DATA-011: a dead-lettered message is reported as such and not claimed", async () => {
    const { Db, Raw } = createTestDatabase();
    const envelope = fetchPageEnvelope("run-1", "openalex", 0);
    await claimMessage(Db, envelope, NOW);
    Raw.prepare("UPDATE queue_message_log SET status = 'dead-lettered' WHERE message_id = ?").run(
      envelope.MessageId,
    );

    expect(await claimMessage(Db, envelope, NOW)).toBe("dead-lettered");
  });

  it("REQ-DATA-011: claims of two deliveries that arrive together never fail on the unique key", async () => {
    const { Db, Raw } = createTestDatabase();
    const envelope = fetchPageEnvelope("run-1", "openalex", 0);

    const results = await Promise.all([
      claimMessage(Db, envelope, NOW),
      claimMessage(Db, envelope, NOW),
    ]);
    expect(results).toEqual(["claimed", "claimed"]);
    expect(attemptsOf(Raw, envelope.MessageId).attempts).toBe(2);
  });
});
