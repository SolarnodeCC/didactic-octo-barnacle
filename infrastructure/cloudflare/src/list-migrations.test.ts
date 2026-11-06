import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { printMigrations } from "./list-migrations.js";
import { listMigrationFiles } from "./migrations.js";

describe("REQ-NFR-020: migration list CLI", () => {
  it("REQ-NFR-020: prints the repository migrations in the order they are applied", () => {
    const lines: string[] = [];

    printMigrations((line) => lines.push(line));

    expect(lines).toEqual(listMigrationFiles());
    expect(lines[0]).toBe("0001_init.sql");
  });

  it("REQ-NFR-020: prints only numbered SQL files, sorted", () => {
    const dir = mkdtempSync(join(tmpdir(), "roi-migrations-"));
    try {
      for (const name of ["0002_b.sql", "README.md", "0001_a.sql", "draft.sql"]) {
        writeFileSync(join(dir, name), "");
      }
      const lines: string[] = [];

      printMigrations((line) => lines.push(line), dir);

      expect(lines).toEqual(["0001_a.sql", "0002_b.sql"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
