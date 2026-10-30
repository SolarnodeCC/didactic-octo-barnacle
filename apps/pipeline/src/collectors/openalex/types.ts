import { type AbstractInvertedIndex } from "./abstract.js";

export type OpenAlexAuthorship = {
  author_position?: string;
  author?: {
    id?: string;
    display_name?: string;
    orcid?: string | null;
  };
  institutions?: Array<{ display_name?: string }>;
};

export type OpenAlexWork = {
  id: string;
  title?: string | null;
  display_name?: string | null;
  publication_date?: string | null;
  doi?: string | null;
  ids?: {
    openalex?: string;
    doi?: string;
    doi_url?: string;
    arxiv?: string;
  };
  abstract_inverted_index?: AbstractInvertedIndex | null;
  authorships?: OpenAlexAuthorship[];
  topics?: Array<{
    display_name?: string;
    field?: { display_name?: string };
    subfield?: { display_name?: string };
  }>;
  cited_by_count?: number;
  language?: string | null;
  is_retracted?: boolean;
  open_access?: {
    is_oa?: boolean;
    oa_url?: string | null;
    any_repository_has_fulltext?: boolean;
  };
  primary_location?: {
    license?: string | null;
    pdf_url?: string | null;
    landing_page_url?: string | null;
  } | null;
};
