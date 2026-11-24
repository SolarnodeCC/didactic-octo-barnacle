import { type ArxivEntry } from "../collectors/arxiv/types.js";
import { type OpenAlexWork } from "../collectors/openalex/types.js";
import { invertAbstract } from "../slice/fixture.js";

/**
 * The load corpus (REQ-NFR-010, ADR 0118): generated, not committed, because a large corpus does
 * not belong in git (test-data.md). Every publication is in scope, complete, without authors or
 * a PDF, and unique by title, DOI, and arXiv ID. Each abstract holds the example's sentences, so
 * the recorded extraction answer quotes it verbatim.
 */
export const LOAD_SENTENCES =
  "We followed 412 knowledge workers in three public agencies for six months. Frequent switching between tasks reduced sustained focus. Current calendar tools schedule meetings but do not plan focus time.";

/** The split of the largest measured day: 4,090 from OpenAlex and 544 from arXiv. */
export const LARGEST_DAY = { OpenAlex: 4090, Arxiv: 544 } as const;

export function splitCorpus(total: number): { OpenAlex: number; Arxiv: number } {
  const all = LARGEST_DAY.OpenAlex + LARGEST_DAY.Arxiv;
  const arxiv = Math.round((total * LARGEST_DAY.Arxiv) / all);
  return { OpenAlex: total - arxiv, Arxiv: arxiv };
}

export function loadWork(n: number, publicationDate: string): OpenAlexWork {
  return {
    id: `https://openalex.org/W9${String(n).padStart(8, "0")}`,
    type: "article",
    title: `Load study ${n} of focus loss in public agencies`,
    publication_date: publicationDate,
    doi: `https://doi.org/10.9999/load.${n}`,
    ids: {
      openalex: `https://openalex.org/W9${String(n).padStart(8, "0")}`,
      doi: `https://doi.org/10.9999/load.${n}`,
    },
    abstract_inverted_index: invertAbstract(`Study ${n}. ${LOAD_SENTENCES}`),
    authorships: [],
    topics: [
      {
        display_name: "Public Administration",
        field: { display_name: "Social Sciences" },
        subfield: { display_name: "Public Administration" },
      },
    ],
    cited_by_count: 0,
    language: "en",
    is_retracted: false,
    open_access: { is_oa: false, oa_url: null },
    primary_location: { license: null, pdf_url: null, landing_page_url: null },
  };
}

export function loadEntry(n: number, published: string): ArxivEntry {
  return {
    id: `http://arxiv.org/abs/2611.${String(n).padStart(5, "0")}v1`,
    title: `Load preprint ${n} on task switching`,
    summary: `Preprint ${n}. ${LOAD_SENTENCES}`,
    published,
    updated: published,
    categories: ["cs.CY"],
    primaryCategory: "cs.CY",
    authors: [],
  };
}
