import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { type RecallCorpus } from "./recall.js";

/**
 * Builds the recall corpus from the committed fixtures (ADR 0057). Node only: it reads files,
 * so it is not exported from the package index and never reaches a Worker bundle.
 *
 * - Publications: the arXiv fixtures of the extraction golden set and every publication of the
 *   Research Analyst neighbour files, by arXiv ID without version, each once.
 * - Queries: each publication with a neighbour file, by its title and abstract; its relevant
 *   publications are the neighbours in that file, its frozen nearest publications.
 */
export function buildRecallCorpus(arxivDir: string, neighboursDir: string): RecallCorpus {
  const publications = new Map<string, RecallCorpus["Publications"][number]>();
  const add = (id: string, title: string, summary: string) => {
    if (!publications.has(id)) {
      publications.set(id, { Id: id, Title: clean(title), Abstract: clean(summary) });
    }
  };
  for (const file of readdirSync(arxivDir)
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    const data = JSON.parse(readFileSync(join(arxivDir, file), "utf8")) as Fixture;
    add(arxivId(data.id ?? basename(file, ".json")), data.title ?? "", data.summary ?? "");
  }
  const queries: RecallCorpus["Queries"] = [];
  for (const file of readdirSync(neighboursDir)
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    const base = arxivId(basename(file, ".json"));
    const neighbours = JSON.parse(readFileSync(join(neighboursDir, file), "utf8")) as Fixture[];
    for (const neighbour of neighbours) {
      add(arxivId(neighbour.id ?? ""), neighbour.title ?? "", neighbour.summary ?? "");
    }
    const query = publications.get(base);
    if (!query) {
      continue;
    }
    const relevant = [...new Set(neighbours.map((n) => arxivId(n.id ?? "")))].filter(
      (id) => id !== base,
    );
    queries.push({
      Id: base,
      Text: `${query.Title}\n\n${query.Abstract}`,
      Relevant: relevant,
    });
  }
  return {
    Publications: [...publications.values()].sort((a, b) => a.Id.localeCompare(b.Id)),
    Queries: queries,
  };
}

type Fixture = { id?: string; title?: string; summary?: string };

/** `http://arxiv.org/abs/2510.27493v2` and `2510.27493` both become `2510.27493`. */
function arxivId(value: string): string {
  return value
    .replace(/^https?:\/\/arxiv\.org\/abs\//iu, "")
    .replace(/v\d+$/iu, "")
    .trim();
}

function clean(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

/** Reads the committed corpus: `publications.json` and `queries.json` (ADR 0057). */
export function loadRecallCorpus(dir: string): RecallCorpus {
  const publications = JSON.parse(
    readFileSync(join(dir, "publications.json"), "utf8"),
  ) as RecallCorpus["Publications"];
  const byId = new Map(publications.map((p) => [p.Id, p]));
  const queries = JSON.parse(readFileSync(join(dir, "queries.json"), "utf8")) as Array<{
    Id: string;
    Relevant: string[];
  }>;
  return {
    Publications: publications,
    Queries: queries.map((query) => {
      const publication = byId.get(query.Id);
      if (!publication) {
        throw new Error(`query ${query.Id} is not a corpus publication`);
      }
      return {
        Id: query.Id,
        Text: `${publication.Title}\n\n${publication.Abstract}`,
        Relevant: query.Relevant,
      };
    }),
  };
}

/** `recall.threshold.json`: the recall at 10 the corpus requires (ADR 0057, REQ-PROC-003 AC3). */
export function loadRecallThreshold(dir: string): { metric: "recall-at-10"; minimum: number } {
  return JSON.parse(readFileSync(join(dir, "recall.threshold.json"), "utf8")) as {
    metric: "recall-at-10";
    minimum: number;
  };
}
