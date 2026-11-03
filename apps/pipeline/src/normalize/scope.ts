/** The industry values of ADR 0037, in the order of docs/kt/overview.md. `other` has no row. */
export const TARGET_INDUSTRIES = [
  "automotive",
  "aerospace-defense",
  "consumer-retail",
  "energy-utilities",
  "banking",
  "insurance",
  "public-sector",
  "life-sciences",
] as const;

export type TargetIndustry = (typeof TARGET_INDUSTRIES)[number];

export type IndustryTopics = {
  /** OpenAlex subfield names, exactly as the OpenAlex taxonomy spells them. */
  OpenAlex: readonly string[];
  /** arXiv categories that belong to the industry. */
  Arxiv: readonly string[];
};

/**
 * Topic map of docs/kt/data-sources/ingestion-scope.md (ADR 0038, OQ-039). The OpenAlex names
 * are subfield names from the taxonomy; matching is case-insensitive on the full name.
 */
export const INDUSTRY_TOPIC_MAP: Readonly<Record<TargetIndustry, IndustryTopics>> = {
  automotive: {
    OpenAlex: [
      "Automotive Engineering",
      "Control and Systems Engineering",
      "Mechanical Engineering",
      "Industrial and Manufacturing Engineering",
      "Safety, Risk, Reliability and Quality",
      "Transportation",
    ],
    Arxiv: ["cs.RO", "eess.SY"],
  },
  "aerospace-defense": {
    OpenAlex: [
      "Aerospace Engineering",
      "Space and Planetary Science",
      "Control and Systems Engineering",
      "Safety, Risk, Reliability and Quality",
      "Signal Processing",
    ],
    Arxiv: ["cs.RO", "eess.SY", "eess.SP", "astro-ph.IM", "physics.space-ph"],
  },
  "consumer-retail": {
    OpenAlex: [
      "Marketing",
      "Strategy and Management",
      "Business and International Management",
      "Management Science and Operations Research",
      "Food Science",
    ],
    Arxiv: ["cs.IR", "econ.GN", "stat.AP"],
  },
  "energy-utilities": {
    OpenAlex: [
      "Energy Engineering and Power Technology",
      "Renewable Energy, Sustainability and the Environment",
      "Fuel Technology",
      "Nuclear Energy and Engineering",
      "Electrical and Electronic Engineering",
    ],
    Arxiv: ["eess.SY", "math.OC"],
  },
  banking: {
    OpenAlex: [
      "Finance",
      "Accounting",
      "Economics and Econometrics",
      "Management Information Systems",
      "Information Systems",
    ],
    Arxiv: ["q-fin.CP", "q-fin.GN", "q-fin.PM", "q-fin.RM", "q-fin.ST", "q-fin.TR", "econ.GN"],
  },
  insurance: {
    OpenAlex: ["Finance", "Economics and Econometrics", "Statistics, Probability and Uncertainty"],
    Arxiv: ["q-fin.RM", "stat.AP"],
  },
  "public-sector": {
    OpenAlex: [
      "Public Administration",
      "Law",
      "Political Science and International Relations",
      "Information Systems",
      "Urban Studies",
    ],
    Arxiv: ["cs.CY"],
  },
  "life-sciences": {
    OpenAlex: [
      "Pharmaceutical Science",
      "Drug Discovery",
      "Pharmacology",
      "Biotechnology",
      "Molecular Medicine",
      "Biomedical Engineering",
      "Health Informatics",
      "Radiology, Nuclear Medicine and Imaging",
      "Epidemiology",
    ],
    Arxiv: ["q-bio.QM", "q-bio.BM", "q-bio.GN", "physics.med-ph", "eess.IV"],
  },
};

/**
 * Computing categories that carry work for every industry. They stay from the pilot map, so
 * moving to eight industries does not narrow what arXiv delivers.
 */
export const CROSS_INDUSTRY_ARXIV_CATEGORIES = ["cs.AI", "cs.SE", "cs.HC", "cs.CY"] as const;

/** The OpenAlex subfields that match the cross-industry arXiv categories (cs.SE and cs.HC). */
export const CROSS_INDUSTRY_OPENALEX_TOPIC_NAMES = [
  "Software",
  "Human-Computer Interaction",
] as const;

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** Every arXiv category of the map: the cross-industry ones plus those of the eight industries. */
export const SCOPE_ARXIV_CATEGORIES: readonly string[] = unique([
  ...CROSS_INDUSTRY_ARXIV_CATEGORIES,
  ...TARGET_INDUSTRIES.flatMap((industry) => INDUSTRY_TOPIC_MAP[industry].Arxiv),
]);

/** Every OpenAlex subfield name of the map, the cross-industry ones included, each once. */
export const SCOPE_OPENALEX_TOPIC_NAMES: readonly string[] = unique([
  ...CROSS_INDUSTRY_OPENALEX_TOPIC_NAMES,
  ...TARGET_INDUSTRIES.flatMap((industry) => INDUSTRY_TOPIC_MAP[industry].OpenAlex),
]);

/** The industries whose rows contain at least one of the given OpenAlex names or arXiv categories. */
export function industriesForTopics(topics: {
  OpenAlexNames?: readonly string[];
  ArxivCategories?: readonly string[];
}): TargetIndustry[] {
  const names = new Set((topics.OpenAlexNames ?? []).map((value) => value.toLowerCase()));
  const categories = new Set((topics.ArxivCategories ?? []).map((value) => value.toLowerCase()));
  return TARGET_INDUSTRIES.filter((industry) => {
    const row = INDUSTRY_TOPIC_MAP[industry];
    return (
      row.OpenAlex.some((name) => names.has(name.toLowerCase())) ||
      row.Arxiv.some((category) => categories.has(category.toLowerCase()))
    );
  });
}

export function isArxivCategoryInScope(
  categories: string[],
  allowed: readonly string[] = SCOPE_ARXIV_CATEGORIES,
): boolean {
  const allowedSet = new Set(allowed.map((value) => value.toLowerCase()));
  return categories.some((category) => allowedSet.has(category.toLowerCase()));
}

export function isOpenAlexTopicsInScope(
  topicNames: string[],
  allowedNames: readonly string[],
): boolean {
  const allowed = new Set(allowedNames.map((value) => value.toLowerCase()));
  return topicNames.some((name) => allowed.has(name.toLowerCase()));
}
