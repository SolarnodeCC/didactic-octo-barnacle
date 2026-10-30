import { XMLParser } from "fast-xml-parser";

import { type ArxivEntry } from "./types.js";

type XmlText = string | number | { "#text"?: string | number };
type XmlAttrNode = { "@_term"?: string; "@_href"?: string; "@_title"?: string };

type XmlEntry = {
  id?: XmlText;
  title?: XmlText;
  summary?: XmlText;
  published?: XmlText;
  updated?: XmlText;
  "arxiv:doi"?: XmlText;
  "arxiv:comment"?: XmlText;
  "arxiv:primary_category"?: XmlAttrNode;
  category?: XmlAttrNode[];
  link?: XmlAttrNode[];
  author?: Array<{ name?: XmlText; "arxiv:affiliation"?: XmlText | XmlText[] }>;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  isArray: (name) => ["entry", "author", "category", "link"].includes(name),
});

function text(node: XmlText | undefined): string {
  if (node === undefined || node === null) {
    return "";
  }
  if (typeof node === "object") {
    return String(node["#text"] ?? "").trim();
  }
  return String(node).trim();
}

/** arXiv marks a withdrawn paper in the abstract or the comment (REQ-DATA-008 reads the flag). */
function isWithdrawn(entry: XmlEntry): boolean {
  return /\bwithdrawn\b/i.test(`${text(entry["arxiv:comment"])} ${text(entry.summary)}`);
}

/** Parse an arXiv Atom API response into entries (REQ-DATA-002). */
export function parseArxivFeed(xml: string): ArxivEntry[] {
  const parsed = parser.parse(xml) as { feed?: { entry?: XmlEntry[] } };
  return (parsed.feed?.entry ?? []).map((entry): ArxivEntry => {
    const categories = (entry.category ?? [])
      .map((category) => category["@_term"])
      .filter((term): term is string => Boolean(term));
    const primaryCategory = entry["arxiv:primary_category"]?.["@_term"] ?? categories[0] ?? "";
    const pdfLink = (entry.link ?? []).find((link) => link["@_title"] === "pdf");
    const doi = text(entry["arxiv:doi"]);

    return {
      id: text(entry.id),
      title: text(entry.title),
      summary: text(entry.summary),
      published: text(entry.published),
      updated: text(entry.updated),
      categories,
      primaryCategory,
      authors: (entry.author ?? []).map((author) => {
        const affiliation = text(
          Array.isArray(author["arxiv:affiliation"])
            ? author["arxiv:affiliation"][0]
            : author["arxiv:affiliation"],
        );
        return affiliation ? { name: text(author.name), affiliation } : { name: text(author.name) };
      }),
      ...(doi ? { doi } : {}),
      ...(pdfLink?.["@_href"] ? { pdfUrl: pdfLink["@_href"] } : {}),
      ...(isWithdrawn(entry) ? { withdrawn: true } : {}),
    };
  });
}
