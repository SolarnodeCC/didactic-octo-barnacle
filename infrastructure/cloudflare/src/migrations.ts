import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export function migrationsDir(): string {
  return path.resolve(here, "../migrations");
}

export function listMigrationFiles(dir: string = migrationsDir()): string[] {
  return fs
    .readdirSync(dir)
    .filter((name) => /^\d+_.*\.sql$/u.test(name))
    .sort();
}

export function readMigrationSql(fileName: string, dir: string = migrationsDir()): string {
  return fs.readFileSync(path.join(dir, fileName), "utf8");
}

export function applyMigrations(
  exec: (sql: string) => void,
  dir: string = migrationsDir(),
): string[] {
  const applied: string[] = [];
  for (const fileName of listMigrationFiles(dir)) {
    exec(readMigrationSql(fileName, dir));
    applied.push(fileName);
  }
  return applied;
}
