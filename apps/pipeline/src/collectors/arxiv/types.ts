export type ArxivAuthor = {
  name: string;
  affiliation?: string;
};

export type ArxivEntry = {
  id: string;
  title: string;
  summary: string;
  published: string;
  updated: string;
  doi?: string;
  categories: string[];
  primaryCategory: string;
  authors: ArxivAuthor[];
  pdfUrl?: string;
  license?: string;
  withdrawn?: boolean;
};
