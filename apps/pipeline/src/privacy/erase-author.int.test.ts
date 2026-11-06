import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createAuthorKeyHasher } from "./author-key.js";
import { eraseAuthor, findAuthorIds, reapplyErasures } from "./erase-author.js";
import { runScheduled } from "../schedule/run-scheduled.js";
import {
  createHarness,
  everythingStored,
  makeEntry,
  makeWork,
  openAlexPage,
  arxivPage,
  type Harness,
} from "../test/harness.js";
import { type OpenAlexWork } from "../collectors/openalex/types.js";

const CRON = "0 6 * * *";
const ARXIV_CRON = "30 7 * * *";
const ADA_ID = "orcid:0000-0001-2345-6789";
const ACTOR = "admin_opaque_1";
const PERSONAL = ["Ada Lovelace", "0000-0001-2345-6789", "Example University", "ada lovelace"];

/** A work by Ada (first author, with ORCID) and Grace (no ORCID). */
function workWithTwoAuthors(n: number, title?: string): OpenAlexWork {
  const base = makeWork(n);
  return {
    ...base,
    ...(title ? { title } : {}),
    authorships: [
      {
        author_position: "first",
        author: {
          id: "https://openalex.org/A1",
          display_name: "Ada Lovelace",
          orcid: "https://orcid.org/0000-0001-2345-6789",
        },
        institutions: [{ display_name: "Example University" }],
      },
      {
        author_position: "last",
        author: { id: "https://openalex.org/A2", display_name: "Grace Hopper", orcid: null },
        institutions: [{ display_name: "Navy Lab" }],
      },
    ],
  };
}

async function ingest(h: Harness, works: OpenAlexWork[]) {
  h.SetOpenAlexPages([openAlexPage(works, null)]);
  await runScheduled(h.Deps, CRON);
  await h.Drain();
}

function rows(h: Harness, sql: string, ...values: string[]) {
  return h.Database.Raw.prepare(sql).all(...values) as Array<Record<string, unknown>>;
}

describe("REQ-NFR-016: erasing an author", () => {
  it("REQ-NFR-016: removes the author record and affiliations and keeps the publications", async () => {
    const h = createHarness();
    await ingest(h, [workWithTwoAuthors(1), workWithTwoAuthors(2)]);
    expect(h.Count("authorship")).toBe(4);

    const result = await eraseAuthor(h.Erasure, ADA_ID, { Reason: "author-request", Actor: ACTOR });

    expect(result).toMatchObject({
      Outcome: "erased",
      AuthorshipsRemoved: 2,
      PublicationsUpdated: 2,
    });
    expect(h.Count("publication")).toBe(2);
    expect(rows(h, "SELECT id FROM author")).toEqual([{ id: "src:A2" }]);
    expect(h.Count("authorship")).toBe(2);
    expect(rows(h, "SELECT author_id FROM authorship WHERE author_id = ?", ADA_ID)).toEqual([]);
  });

  it("REQ-NFR-016: no trace of the name, ORCID, or affiliation is left in the database or the bucket", async () => {
    const h = createHarness();
    await ingest(h, [workWithTwoAuthors(1), workWithTwoAuthors(2)]);
    expect(everythingStored(h)).toContain("Ada Lovelace");
    expect(everythingStored(h).toLowerCase()).toContain("ada lovelace"); // the title key held it

    await eraseAuthor(h.Erasure, ADA_ID, { Reason: "author-request", Actor: ACTOR });

    const stored = everythingStored(h).toLowerCase();
    for (const text of PERSONAL) {
      expect(stored, text).not.toContain(text.toLowerCase());
    }
    expect(stored).not.toContain(ADA_ID);
    expect(stored).toContain("grace hopper"); // other authors are untouched
  });

  it("REQ-NFR-016: clears the title-and-first-author key of the author's publications", async () => {
    const h = createHarness();
    await ingest(h, [workWithTwoAuthors(1)]);
    expect(rows(h, "SELECT title_author_key FROM publication")[0]?.["title_author_key"]).toContain(
      "ada lovelace",
    );
    await eraseAuthor(h.Erasure, ADA_ID, { Reason: "author-request", Actor: ACTOR });
    expect(rows(h, "SELECT title_author_key FROM publication")[0]?.["title_author_key"]).toBeNull();
  });

  it("REQ-NFR-016: records an audit event with counts and a reason code, without personal data", async () => {
    const h = createHarness();
    await ingest(h, [workWithTwoAuthors(1), workWithTwoAuthors(2)]);
    const result = await eraseAuthor(h.Erasure, ADA_ID, { Reason: "legal-order", Actor: ACTOR });

    const events = rows(h, "SELECT * FROM audit_event");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "author.erased",
      actor_id_opaque: ACTOR,
      organization_id: null,
    });
    expect(JSON.parse(events[0]?.["meta_json"] as string)).toEqual({
      ErasureId: (result as { ErasureId: string }).ErasureId,
      Reason: "legal-order",
      AuthorshipsRemoved: 2,
      PublicationsUpdated: 2,
    });
    const text = JSON.stringify(events).toLowerCase();
    for (const personal of [...PERSONAL, ADA_ID]) {
      expect(text, personal).not.toContain(personal.toLowerCase());
    }
  });

  it("REQ-NFR-016: the erasure list holds a keyed hash, not the ID, and is kept in the bucket too", async () => {
    const h = createHarness();
    await ingest(h, [workWithTwoAuthors(1)]);
    await eraseAuthor(h.Erasure, ADA_ID, { Reason: "author-request", Actor: ACTOR });

    const [tombstone] = rows(h, "SELECT * FROM author_erasure");
    const hash = tombstone?.["subject_hash"] as string;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(createHash("sha256").update(ADA_ID).digest("hex")); // keyed, not plain
    expect([...h.Bucket.objects.keys()].filter((key) => key.startsWith("erasures/"))).toEqual([
      `erasures/${hash}.json`,
    ]);
  });

  it("REQ-NFR-016: erasing again changes nothing and an unknown author writes nothing", async () => {
    const h = createHarness();
    await ingest(h, [workWithTwoAuthors(1)]);
    const first = await eraseAuthor(h.Erasure, ADA_ID, { Reason: "author-request", Actor: ACTOR });
    const again = await eraseAuthor(h.Erasure, ADA_ID, { Reason: "author-request", Actor: ACTOR });

    expect(again).toEqual({
      Outcome: "already-erased",
      ErasureId: (first as { ErasureId: string }).ErasureId,
    });
    expect(h.Count("author_erasure")).toBe(1);
    expect(h.Count("audit_event")).toBe(1);

    const other = createHarness();
    expect(
      await eraseAuthor(other.Erasure, "orcid:0000-0000-0000-0000", {
        Reason: "author-request",
        Actor: ACTOR,
      }),
    ).toEqual({ Outcome: "not-found" });
    expect(other.Count("author_erasure") + other.Count("audit_event")).toBe(0);
    expect(other.Bucket.objects.size).toBe(0);
  });

  it("REQ-NFR-016: a free-text reason is refused, so a name cannot end up in the audit log", async () => {
    const h = createHarness();
    await ingest(h, [workWithTwoAuthors(1)]);
    await expect(
      eraseAuthor(h.Erasure, ADA_ID, {
        Reason: "Ada Lovelace asked by email" as never,
        Actor: ACTOR,
      }),
    ).rejects.toThrow();
    expect(h.Count("author")).toBe(2);
    expect(h.Count("audit_event")).toBe(0);
  });

  it("REQ-NFR-016: finds authors by ORCID or by name in any letter case", async () => {
    const h = createHarness();
    await ingest(h, [workWithTwoAuthors(1)]);
    expect(
      await findAuthorIds(h.Database.Db, { Orcid: "https://orcid.org/0000-0001-2345-6789" }),
    ).toEqual([ADA_ID]);
    expect(await findAuthorIds(h.Database.Db, { Name: "GRACE hopper" })).toEqual(["src:A2"]);
    expect(await findAuthorIds(h.Database.Db, { Name: "Nobody Here" })).toEqual([]);
    expect(await findAuthorIds(h.Database.Db, {})).toEqual([]);
  });
});

describe("REQ-NFR-016: an erased author stays erased", () => {
  it("REQ-NFR-016: the next ingestion of the same works does not store the author again", async () => {
    const h = createHarness();
    await ingest(h, [workWithTwoAuthors(1), workWithTwoAuthors(2)]);
    await eraseAuthor(h.Erasure, ADA_ID, { Reason: "author-request", Actor: ACTOR });

    h.Clock.Now = "2026-10-31T06:00:00.000Z";
    await ingest(h, [workWithTwoAuthors(1), workWithTwoAuthors(2), workWithTwoAuthors(3)]);

    expect(h.Run()["status"]).toBe("succeeded");
    expect(h.Count("publication")).toBe(3);
    expect(rows(h, "SELECT id FROM author")).toEqual([{ id: "src:A2" }]);
    expect(rows(h, "SELECT * FROM authorship WHERE author_id = ?", ADA_ID)).toEqual([]);
    for (const text of PERSONAL) {
      expect(everythingStored(h).toLowerCase(), text).not.toContain(text.toLowerCase());
    }
  });

  it("REQ-NFR-016: an erased first author is not used to match or flag publications", async () => {
    const h = createHarness();
    await ingest(h, [workWithTwoAuthors(1)]);
    await eraseAuthor(h.Erasure, ADA_ID, { Reason: "author-request", Actor: ACTOR });

    h.Clock.Now = "2026-10-31T06:00:00.000Z";
    const title = "A shared title about clinical decision support";
    await ingest(h, [workWithTwoAuthors(10, title), workWithTwoAuthors(11, title)]);

    expect(h.Count("title_author_review")).toBe(0);
    expect(
      rows(h, "SELECT title_author_key FROM publication WHERE title_author_key IS NOT NULL"),
    ).toEqual([]);
  });

  it("REQ-NFR-016: an arXiv author is erased by ID and stays erased when the paper is fetched again", async () => {
    const h = createHarness();
    const entry = makeEntry(1, "2026-10-29T10:00:00Z");
    h.SetArxivPages([arxivPage([entry])]);
    await runScheduled(h.Deps, ARXIV_CRON);
    await h.Drain();

    const [id] = await findAuthorIds(h.Database.Db, { Name: "Author 1" });
    expect(id).toBeDefined();
    await eraseAuthor(h.Erasure, id as string, { Reason: "author-request", Actor: ACTOR });

    h.Clock.Now = "2026-10-31T06:00:00.000Z";
    h.SetArxivPages([arxivPage([entry])]);
    await runScheduled(h.Deps, ARXIV_CRON);
    await h.Drain();

    expect(h.Count("publication")).toBe(1);
    expect(h.Count("author")).toBe(0);
    expect(everythingStored(h)).not.toContain("Author 1");
  });

  it("REQ-NFR-016: after a database restore the durable list removes the author again", async () => {
    const h = createHarness();
    await ingest(h, [workWithTwoAuthors(1)]);
    await eraseAuthor(h.Erasure, ADA_ID, { Reason: "author-request", Actor: ACTOR });

    // A restore to an earlier point: the list in the database is gone, the bucket's is not.
    h.Database.Raw.prepare("DELETE FROM author_erasure").run();
    h.Clock.Now = "2026-10-31T06:00:00.000Z";
    await ingest(h, [workWithTwoAuthors(1)]);
    expect(rows(h, "SELECT id FROM author WHERE id = ?", ADA_ID)).toHaveLength(1); // back again

    const result = await reapplyErasures(h.Erasure);

    expect(result).toEqual({ ListEntries: 1, AuthorsRemoved: 1 });
    expect(rows(h, "SELECT id FROM author WHERE id = ?", ADA_ID)).toEqual([]);
    expect(h.Count("author_erasure")).toBe(1);
    expect(rows(h, "SELECT action FROM audit_event ORDER BY created_at")).toContainEqual({
      action: "author.erasure_reapplied",
    });

    h.Clock.Now = "2026-11-01T06:00:00.000Z";
    await ingest(h, [workWithTwoAuthors(1)]);
    expect(rows(h, "SELECT id FROM author WHERE id = ?", ADA_ID)).toEqual([]);
  });

  it("REQ-NFR-016: without the erasure key ingestion stops instead of storing an author", async () => {
    for (const AuthorKey of [null, "too-short"]) {
      const h = createHarness({}, { AuthorKey });
      await ingest(h, [workWithTwoAuthors(1)]);

      expect(h.Run()["status"]).toBe("failed");
      expect(h.Queue.deadLettered).toHaveLength(1);
      expect(h.Count("author")).toBe(0);
      expect(h.Count("publication")).toBe(0);
    }
  });
});

describe("REQ-NFR-016: the erasure key", () => {
  it("REQ-NFR-016: the hash is stable, depends on the key, and is not a plain hash", async () => {
    const keyA = "a".repeat(40);
    const hashA = createAuthorKeyHasher(keyA);
    const hashB = createAuthorKeyHasher("b".repeat(40));
    expect(await hashA(ADA_ID)).toBe(await hashA(ADA_ID));
    expect(await hashA(ADA_ID)).not.toBe(await hashB(ADA_ID));
    expect(await hashA(ADA_ID)).not.toBe(await hashA("orcid:0000-0000-0000-0001"));
    expect(await hashA(ADA_ID)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("REQ-NFR-009: only public author metadata is stored", () => {
  it("REQ-NFR-009: the only person-related columns are the name, ORCID, and affiliation, and the derived key", () => {
    const h = createHarness();
    const tables = rows(
      h,
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ) as Array<{ name: string }>;
    const found: string[] = [];
    for (const { name } of tables) {
      for (const column of rows(h, `PRAGMA table_info(${name})`) as Array<{ name: string }>) {
        if (/name|email|orcid|affiliation|author/i.test(column.name)) {
          found.push(`${name}.${column.name}`);
        }
      }
    }
    // A new person-related column has to be added here on purpose, with a reason to store it.
    expect(found.sort()).toEqual([
      "author.display_name",
      "author.orcid",
      "authorship.affiliation",
      "authorship.affiliations_json",
      "authorship.author_id",
      "publication.title_author_key",
    ]);
  });
});
