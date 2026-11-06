import { describe, expect, it } from "vitest";

import {
  dependenciesOf,
  isContractMigration,
  planRelease,
  type Change,
  type PlanInput,
} from "./plan.js";

function change(n: number, extra: Partial<Change> = {}): Change {
  return {
    Sha: `sha${n}`.padEnd(40, "0"),
    PrNumber: n,
    Title: `Change ${n}`,
    Labels: [],
    Body: "",
    ChecksGreen: true,
    ContractMigration: false,
    ...extra,
  };
}

const NOW = "2026-11-10T09:00:00Z";

function input(changes: Change[], extra: Partial<PlanInput> = {}): PlanInput {
  return {
    Changes: changes,
    // The newest change was deployed three days before `NOW`, so everything has soaked.
    StagingDeploys: changes.length
      ? [{ Sha: (changes[changes.length - 1] as Change).Sha, At: "2026-11-07T09:00:00Z" }]
      : [],
    OpenPrNumbers: [],
    OpenAlerts: 0,
    Now: NOW,
    SoakHours: 48,
    ...extra,
  };
}

describe("REQ-NFR-020: weekly production release plan", () => {
  it("REQ-NFR-020: nothing to release gives no SHA", () => {
    expect(planRelease(input([])).Sha).toBeNull();
  });

  it("REQ-NFR-020: all soaked and clean changes ship up to the newest one", () => {
    const plan = planRelease(input([change(1), change(2), change(3)]));
    expect(plan.Sha).toBe(change(3).Sha);
    expect(plan.Deferred).toEqual([]);
  });

  it("REQ-NFR-020: a hold label cuts the release before that change", () => {
    const plan = planRelease(input([change(1), change(2, { Labels: ["hold"] }), change(3)]));
    expect(plan.Sha).toBe(change(1).Sha);
    expect(plan.Deferred.map((d) => d.PrNumber)).toEqual([2, 3]);
    expect(plan.Deferred[1]?.Reason).toMatch(/behind/);
  });

  it("REQ-NFR-020: a dependency that comes later on main cuts the release", () => {
    const plan = planRelease(input([change(1, { Body: "Depends on #3" }), change(2), change(3)]));
    expect(plan.Sha).toBeNull();
    expect(plan.Deferred[0]?.Reason).toMatch(/#3/);
  });

  it("REQ-NFR-020: a dependency earlier in the release or already released is fine", () => {
    const plan = planRelease(
      input([change(5), change(6, { Body: "depends on #5 and Depends on #2" })]),
    );
    expect(plan.Sha).toBe(change(6).Sha);
  });

  it("REQ-NFR-020: a dependency on an open pull request holds the change back", () => {
    const plan = planRelease(
      input([change(1), change(2, { Labels: ["depends-on:9"] })], { OpenPrNumbers: [9] }),
    );
    expect(plan.Sha).toBe(change(1).Sha);
  });

  it("REQ-NFR-020: a change that is not on staging long enough waits", () => {
    const changes = [change(1), change(2)];
    const plan = planRelease(
      input(changes, {
        StagingDeploys: [
          { Sha: change(1).Sha, At: "2026-11-07T09:00:00Z" },
          { Sha: change(2).Sha, At: "2026-11-10T08:00:00Z" },
        ],
      }),
    );
    expect(plan.Sha).toBe(change(1).Sha);
    expect(plan.Deferred[0]?.Reason).toMatch(/48 hours/);
  });

  it("REQ-NFR-020: a contract migration needs the label contract-ok", () => {
    const risky = change(2, { ContractMigration: true });
    expect(planRelease(input([change(1), risky])).Sha).toBe(change(1).Sha);
    const ok = change(2, { ContractMigration: true, Labels: ["contract-ok"] });
    expect(planRelease(input([change(1), ok])).Sha).toBe(change(2).Sha);
  });

  it("REQ-NFR-020: red checks and open alerts stop the release", () => {
    expect(planRelease(input([change(1, { ChecksGreen: false })])).Sha).toBeNull();
    expect(planRelease(input([change(1)], { OpenAlerts: 1 })).Sha).toBeNull();
  });

  it("REQ-NFR-020: dependencies come from the body and from labels", () => {
    expect(
      dependenciesOf({ Body: "Depends on #4, depends-on #5", Labels: ["depends-on:7"] }).sort(),
    ).toEqual([4, 5, 7]);
  });

  it("REQ-NFR-020: drop and rename statements are contract migrations", () => {
    expect(isContractMigration("ALTER TABLE a DROP COLUMN b;")).toBe(true);
    expect(isContractMigration("ALTER TABLE a RENAME TO c;")).toBe(true);
    expect(isContractMigration("ALTER TABLE a ADD COLUMN b TEXT;")).toBe(false);
  });
});
