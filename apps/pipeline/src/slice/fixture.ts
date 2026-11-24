import { type ExtractionCandidate } from "@roi/models";

import { type OpenAlexWork } from "../collectors/openalex/types.js";

/**
 * The recorded input of the thin slice (REQ-PROC-007, ADR 0117): the example publication of
 * `docs/kt/examples/context-switching-opportunity.yaml` as one OpenAlex work, and the model
 * answers for its triage and extraction. `fixture.test.ts` keeps the abstract and candidate
 * equal to the example. The work is illustrative and has no author, so no personal data is
 * stored and no erasure key is needed.
 */
export const SLICE_TITLE = "Task switching and focus loss among knowledge workers";

export const SLICE_ABSTRACT =
  "We followed 412 knowledge workers in three public agencies for six months. Frequent switching between tasks reduced sustained focus. Workers who switched more than ten times an hour finished a fifth less work. Current calendar tools schedule meetings but do not plan focus time.";

/** The candidate the recorded extraction answer returns, with quotes from the abstract. */
export const SLICE_CANDIDATE: ExtractionCandidate = {
  Finding: "Frequent task switching measurably reduces the focus and output of knowledge workers.",
  EvidenceQuote: "Frequent switching between tasks reduced sustained focus.",
  Customer: "knowledge workers in public agencies",
  CustomerQuote: "We followed 412 knowledge workers in three public agencies for six months.",
  WhyNow: null,
  WhyNowQuote: null,
  CurrentAlternative: "Calendar tools that schedule meetings",
  AlternativeQuote: "Current calendar tools schedule meetings but do not plan focus time.",
};

/** OpenAlex returns an abstract as word positions; this builds that form from the text. */
export function invertAbstract(text: string): Record<string, number[]> {
  const index: Record<string, number[]> = {};
  text.split(" ").forEach((word, position) => {
    (index[word] ??= []).push(position);
  });
  return index;
}

/** The example publication as OpenAlex returns it, in scope for public administration. */
export function sliceWork(publicationDate: string): OpenAlexWork {
  return {
    id: "https://openalex.org/W0000000001",
    type: "article",
    title: SLICE_TITLE,
    publication_date: publicationDate,
    doi: "https://doi.org/10.0000/example.0001",
    ids: {
      openalex: "https://openalex.org/W0000000001",
      doi: "https://doi.org/10.0000/example.0001",
    },
    abstract_inverted_index: invertAbstract(SLICE_ABSTRACT),
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

/** The recorded triage answer: three of five signals, above the accept cut of 0.55. */
export const SLICE_TRIAGE_OUTPUT = {
  Signals: {
    NamedParty: true,
    StatedHarm: true,
    Trigger: false,
    ExistingAlternative: true,
    Adoptable: false,
  },
  Notes: null,
};

/** The recorded extraction answer: the example candidate. */
export const SLICE_EXTRACTION_OUTPUT = {
  Candidates: [SLICE_CANDIDATE],
  Confidence: 0.7,
  Notes: null,
};
