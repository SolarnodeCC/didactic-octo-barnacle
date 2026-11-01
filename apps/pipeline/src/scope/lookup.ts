import { PILOT_OPENALEX_TOPIC_NAMES } from "../normalize/scope.js";

const OPENALEX_URL = "https://api.openalex.org";

export type TaxonomyLevel = "field" | "subfield";

export type Candidate = {
  /** Numeric ID as OpenAlex filters take it, for example `1710`. */
  Id: string;
  Name: string;
  Level: TaxonomyLevel;
  WorksCount: number | null;
  /** The name equals the topic-map name (case-insensitive). */
  Exact: boolean;
};

export type SubfieldCount = { Id: string; Name: string; Count: number };

type TaxonomyResponse = {
  results?: Array<{ id?: string; display_name?: string; works_count?: number }>;
};

type GroupByResponse = {
  group_by?: Array<{ key?: string; key_display_name?: string; count?: number }>;
  meta?: { count?: number };
};

/** `https://openalex.org/subfields/1710` becomes `1710`. */
export function shortTaxonomyId(id: string): string {
  return id.slice(id.lastIndexOf("/") + 1);
}

export function buildTaxonomySearchUrl(level: TaxonomyLevel, name: string): string {
  const params = new URLSearchParams({
    search: name,
    select: "id,display_name,works_count",
    "per-page": "10",
  });
  return `${OPENALEX_URL}/${level}s?${params.toString()}`;
}

function worksFilter(options: { FromDate: string; SubfieldIds?: readonly string[] }): string {
  const filters = [`from_publication_date:${options.FromDate}`, "language:en", "has_abstract:true"];
  if (options.SubfieldIds && options.SubfieldIds.length > 0) {
    filters.push(`topics.subfield.id:${options.SubfieldIds.join("|")}`);
  }
  return filters.join(",");
}

/** Works per subfield for a date window; the request is one call and downloads no works. */
export function buildGroupByUrl(options: { FromDate: string }): string {
  const params = new URLSearchParams({
    filter: worksFilter(options),
    group_by: "topics.subfield.id",
    "per-page": "200",
  });
  return `${OPENALEX_URL}/works?${params.toString()}`;
}

/** The number of works that match the chosen subfields; `per-page=1` keeps the answer small. */
export function buildCountUrl(options: {
  FromDate: string;
  SubfieldIds: readonly string[];
}): string {
  const params = new URLSearchParams({
    filter: worksFilter(options),
    select: "id",
    "per-page": "1",
  });
  return `${OPENALEX_URL}/works?${params.toString()}`;
}

export function parseCandidates(
  level: TaxonomyLevel,
  topicName: string,
  body: TaxonomyResponse,
): Candidate[] {
  const wanted = topicName.trim().toLowerCase();
  return (body.results ?? []).flatMap((result) =>
    result.id && result.display_name
      ? [
          {
            Id: shortTaxonomyId(result.id),
            Name: result.display_name,
            Level: level,
            WorksCount: result.works_count ?? null,
            Exact: result.display_name.trim().toLowerCase() === wanted,
          },
        ]
      : [],
  );
}

export function parseGroupBy(body: GroupByResponse): SubfieldCount[] {
  return (body.group_by ?? [])
    .flatMap((group) =>
      group.key && group.key_display_name && typeof group.count === "number"
        ? [{ Id: shortTaxonomyId(group.key), Name: group.key_display_name, Count: group.count }]
        : [],
    )
    .sort((left, right) => right.Count - left.Count);
}

export function parseCount(body: GroupByResponse): number | null {
  return typeof body.meta?.count === "number" ? body.meta.count : null;
}

export type TopicLookup = { TopicName: string; Candidates: Candidate[] };

export type LookupReport = {
  FromDate: string;
  Days: number;
  Topics: TopicLookup[];
  /** Works per subfield in the window, largest first. OpenAlex returns at most 200 groups. */
  Volume: SubfieldCount[];
  /** Subfield IDs whose name equals a topic-map name exactly. */
  ExactSubfieldIds: string[];
  /** Works that match `ExactSubfieldIds` in the window, or null when there are none. */
  MatchingWorks: number | null;
};

/** The subfields that carry exactly the name of a topic-map entry, once each. */
export function exactSubfieldIds(topics: readonly TopicLookup[]): string[] {
  const ids = topics.flatMap((topic) =>
    topic.Candidates.filter((c) => c.Level === "subfield" && c.Exact).map((c) => c.Id),
  );
  return [...new Set(ids)];
}

function cell(value: string): string {
  return value.replace(/\|/g, "/");
}

export function formatReport(report: LookupReport): string {
  const volumeById = new Map(report.Volume.map((row) => [row.Id, row.Count]));
  const lines: string[] = [
    "# OpenAlex scope lookup",
    "",
    `Window: works published from ${report.FromDate} (${report.Days} days), English, with an abstract. Nothing was stored; the lookup only reads OpenAlex.`,
    "",
    "## Topic map against the OpenAlex taxonomy",
    "",
    "| Topic-map name | OpenAlex level | ID | OpenAlex name | Exact | Works in window |",
    "|---|---|---|---|---|---|",
  ];
  for (const topic of report.Topics) {
    if (topic.Candidates.length === 0) {
      lines.push(`| ${cell(topic.TopicName)} | none | | | | |`);
    }
    for (const candidate of topic.Candidates) {
      const volume = candidate.Level === "subfield" ? volumeById.get(candidate.Id) : undefined;
      lines.push(
        `| ${cell(topic.TopicName)} | ${candidate.Level} | ${candidate.Id} | ${cell(candidate.Name)} | ${candidate.Exact ? "yes" : "no"} | ${volume ?? ""} |`,
      );
    }
  }

  const missing = report.Topics.filter(
    (topic) => !topic.Candidates.some((c) => c.Level === "subfield" && c.Exact),
  ).map((topic) => topic.TopicName);
  lines.push(
    "",
    "## Result",
    "",
    `Subfield IDs with an exact name match: ${report.ExactSubfieldIds.length > 0 ? report.ExactSubfieldIds.join(", ") : "none"}.`,
    missing.length > 0
      ? `Topic-map names without an exact subfield match (rename them to the OpenAlex name, or use a field ID): ${missing.join("; ")}.`
      : "Every topic-map name has an exact subfield match.",
    report.MatchingWorks === null
      ? "Works matching the exact subfields: not counted."
      : `Works matching the exact subfields in the window: ${report.MatchingWorks}.`,
    "",
    "## Largest subfields in the window (all fields)",
    "",
    "| ID | Subfield | Works |",
    "|---|---|---|",
    ...report.Volume.slice(0, 25).map((row) => `| ${row.Id} | ${cell(row.Name)} | ${row.Count} |`),
    "",
  );
  return lines.join("\n");
}

export type FetchJson = (url: string) => Promise<unknown>;

/** Run the lookup with an injected fetcher, so tests need no network (REQ-TEST-003). */
export async function runLookup(options: {
  FetchJson: FetchJson;
  FromDate: string;
  Days: number;
  TopicNames?: readonly string[];
}): Promise<LookupReport> {
  const names = options.TopicNames ?? PILOT_OPENALEX_TOPIC_NAMES;
  const topics: TopicLookup[] = [];
  for (const name of names) {
    const candidates: Candidate[] = [];
    for (const level of ["field", "subfield"] as const) {
      const body = (await options.FetchJson(
        buildTaxonomySearchUrl(level, name),
      )) as TaxonomyResponse;
      candidates.push(...parseCandidates(level, name, body));
    }
    topics.push({ TopicName: name, Candidates: candidates });
  }

  const volume = parseGroupBy(
    (await options.FetchJson(buildGroupByUrl({ FromDate: options.FromDate }))) as GroupByResponse,
  );
  const ids = exactSubfieldIds(topics);
  const matching =
    ids.length > 0
      ? parseCount(
          (await options.FetchJson(
            buildCountUrl({ FromDate: options.FromDate, SubfieldIds: ids }),
          )) as GroupByResponse,
        )
      : null;

  return {
    FromDate: options.FromDate,
    Days: options.Days,
    Topics: topics,
    Volume: volume,
    ExactSubfieldIds: ids,
    MatchingWorks: matching,
  };
}
