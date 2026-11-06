import { describe, expect, it } from "vitest";

import { admitWithinDailyLimit, decideTriage, type TriageSignals } from "./triage.js";

const none: TriageSignals = {
  NamedParty: false,
  StatedHarm: false,
  Trigger: false,
  ExistingAlternative: false,
  Adoptable: false,
};

describe("REQ-PROC-008: code decides triage from the five signals", () => {
  it("REQ-PROC-008: three signals including party and harm are accepted", () => {
    expect(decideTriage({ ...none, NamedParty: true, StatedHarm: true, Adoptable: true })).toEqual({
      TriageScore: 0.6,
      Accepted: true,
      Reason: "accepted",
    });
  });

  it("REQ-PROC-008: a high score without a named party is rejected as low-score", () => {
    const signals = {
      ...none,
      StatedHarm: true,
      Trigger: true,
      ExistingAlternative: true,
      Adoptable: true,
    };
    expect(decideTriage(signals)).toEqual({
      TriageScore: 0.8,
      Accepted: false,
      Reason: "low-score",
    });
  });

  it("REQ-PROC-008: party and harm alone stay below the default cut", () => {
    expect(decideTriage({ ...none, NamedParty: true, StatedHarm: true }).Accepted).toBe(false);
    expect(decideTriage({ ...none, NamedParty: true, StatedHarm: true }, 0.4).Accepted).toBe(true);
  });
});

describe("REQ-PROC-006: the daily limit admits the best-ranked publications", () => {
  it("REQ-PROC-006: ranks by score, then newest date, then publication ID", () => {
    const items = [
      { PublicationId: "pub_b", PublishedAt: "2026-11-01", TriageScore: 0.6 },
      { PublicationId: "pub_a", PublishedAt: "2026-11-01", TriageScore: 0.6 },
      { PublicationId: "pub_c", PublishedAt: "2026-11-03", TriageScore: 0.6 },
      { PublicationId: "pub_d", PublishedAt: "2026-10-01", TriageScore: 1 },
    ];
    const { Admitted, Deferred } = admitWithinDailyLimit(items, 3);
    expect(Admitted.map((item) => item.PublicationId)).toEqual(["pub_d", "pub_c", "pub_a"]);
    expect(Deferred.map((item) => item.PublicationId)).toEqual(["pub_b"]);
  });
});
