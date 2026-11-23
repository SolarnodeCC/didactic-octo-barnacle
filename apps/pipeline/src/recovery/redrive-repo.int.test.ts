import { describe, expect, it } from "vitest";

import { addRunCountStatements, addRunCounts } from "./redrive-repo.js";
import { createTestDatabase } from "../test/sqlite-d1.js";

describe("REQ-NFR-008: processing run counts", () => {
  it("REQ-NFR-008: counts added in parallel are all kept, none overwritten", async () => {
    const { Db, Raw } = createTestDatabase();
    Raw.prepare(
      "INSERT INTO processing_run (id, kind, day, status, started_at) VALUES ('run_1', 'daily', '2026-10-30', 'running', '2026-10-30T00:00:00.000Z')",
    ).run();

    // A consumer's batch is prepared, then the cron adds its counts before the batch runs: the
    // batch still adds to what is stored then, not to what it would have read before.
    const consumer = addRunCountStatements(Db, "run_1", { Extracted: 1, CandidatesStored: 2 });
    await addRunCounts(Db, "run_1", { Redriven: 3, Extracted: 1 });
    await Db.batch(consumer);
    await addRunCounts(Db, "run_1", { Admitted: 0 });

    const row = Raw.prepare("SELECT counts_json FROM processing_run WHERE id = 'run_1'").get() as {
      counts_json: string;
    };
    expect(JSON.parse(row.counts_json)).toEqual({
      Redriven: 3,
      Extracted: 2,
      CandidatesStored: 2,
      Admitted: 0,
    });
  });
});
