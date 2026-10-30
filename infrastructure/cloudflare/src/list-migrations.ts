#!/usr/bin/env node
import { listMigrationFiles } from "./migrations.js";

for (const fileName of listMigrationFiles()) {
  console.log(fileName);
}
