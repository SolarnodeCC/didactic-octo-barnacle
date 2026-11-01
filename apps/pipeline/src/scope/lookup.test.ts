import { describe, expect, it } from "vitest";

import {
  buildCountUrl,
  buildGroupByUrl,
  buildTaxonomySearchUrl,
  exactSubfieldIds,
  formatReport,
  parseCandidates,
  runLookup,
  shortTaxonomyId,
} from "./lookup.js";

const subfieldBody = {
  results: [
    { id: "https://openalex.org/subfields/1710", display_name: "Information Systems" },
    {
      id: "https://openalex.org/subfields/1709",
      display_name: "Information Systems and Management",
    },
  ],
};

describe("REQ-DATA-001: OpenAlex scope lookup", () => {
  it("REQ-DATA-001: a taxonomy ID is the number at the end of the OpenAlex URL", () => {
    expect(shortTaxonomyId("https://openalex.org/subfields/1710")).toBe("1710");
  });

  it("REQ-DATA-001: a candidate is exact only when its name equals the topic-map name", () => {
    const candidates = parseCandidates("subfield", "information systems", subfieldBody);
    expect(candidates.map((c) => [c.Id, c.Exact])).toEqual([
      ["1710", true],
      ["1709", false],
    ]);
  });

  it("REQ-DATA-001: the volume request groups by subfield and downloads no works", () => {
    const url = new URL(buildGroupByUrl({ FromDate: "2026-08-03" }));
    expect(url.searchParams.get("group_by")).toBe("topics.subfield.id");
    expect(url.searchParams.get("filter")).toBe(
      "from_publication_date:2026-08-03,language:en,has_abstract:true",
    );
  });

  it("REQ-DATA-001: the count request filters on the chosen subfields and fetches one row", () => {
    const url = new URL(buildCountUrl({ FromDate: "2026-08-03", SubfieldIds: ["1710", "1709"] }));
    expect(url.searchParams.get("filter")).toBe(
      "from_publication_date:2026-08-03,language:en,has_abstract:true,topics.subfield.id:1710|1709",
    );
    expect(url.searchParams.get("per-page")).toBe("1");
    expect(buildTaxonomySearchUrl("field", "Law")).toContain("/fields?search=Law");
  });

  it("REQ-DATA-001: the report lists exact matches, names without a match, and the volume", async () => {
    const requested: string[] = [];
    const report = await runLookup({
      Days: 90,
      FromDate: "2026-08-03",
      TopicNames: ["Information systems", "Clinical medicine"],
      FetchJson: (url) => {
        requested.push(url);
        if (url.includes("/subfields?search=Information")) return Promise.resolve(subfieldBody);
        if (url.includes("group_by=")) {
          return Promise.resolve({
            group_by: [
              {
                key: "https://openalex.org/subfields/2706",
                key_display_name: "Medicine",
                count: 9,
              },
              {
                key: "https://openalex.org/subfields/1710",
                key_display_name: "Information Systems",
                count: 5,
              },
            ],
          });
        }
        if (url.includes("topics.subfield.id")) return Promise.resolve({ meta: { count: 5 } });
        return Promise.resolve({ results: [] });
      },
    });

    expect(exactSubfieldIds(report.Topics)).toEqual(["1710"]);
    expect(report.MatchingWorks).toBe(5);
    const text = formatReport(report);
    expect(text).toContain("Subfield IDs with an exact name match: 1710.");
    expect(text).toContain("without an exact subfield match");
    expect(text).toContain("Clinical medicine");
    expect(text).toContain("| 2706 | Medicine | 9 |");
    // Nothing but read requests, and none of them is a works download.
    expect(requested.every((url) => !url.includes("per-page=100&"))).toBe(true);
  });
});
