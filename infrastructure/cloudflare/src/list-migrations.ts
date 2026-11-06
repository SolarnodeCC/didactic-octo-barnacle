#!/usr/bin/env node
import { listMigrationFiles } from "./migrations.js";

/** Prints the migration files in the order they are applied. */
export function printMigrations(log: (line: string) => void, dir?: string): void {
  for (const fileName of dir === undefined ? listMigrationFiles() : listMigrationFiles(dir)) {
    log(fileName);
  }
}

if (process.argv[1]?.endsWith("list-migrations.js")) {
  printMigrations((line) => console.log(line));
}
