/**
 * The stub outputs of the thin slice: the agent sections of
 * `docs/kt/examples/context-switching-opportunity.yaml`, each an output with its evidence beside
 * it under `Evidence` (REQ-PROC-007 AC3). `stub-outputs.test.ts` keeps this copy equal to the
 * example, so a change to the example is one reviewed file plus this mirror.
 */
export const STUB_OUTPUTS: Record<string, Record<string, unknown> & { Evidence?: unknown[] }> = {
  ResearchAnalyst: {
    Novelty: 60,
    NoveltyRationale:
      "Earlier work measured interruptions; this study links switching patterns to output over months.",
    RelatedPublicationIds: ["pub-example-0102", "pub-example-0187"],
    Maturity: "field-tested",
    Industry: ["public-sector"],
    Technology: ["activity sensing", "scheduling optimization"],
    Confidence: 0.6,
    Notes: null,
    Evidence: [
      {
        Field: "NoveltyRationale",
        Kind: "publication-quote",
        Quote: "Frequent switching between tasks reduced sustained focus.",
        PublicationId: "pub-example-0001",
        Url: null,
        Note: null,
        RetrievedAt: "2026-10-01T12:00:00Z",
      },
      {
        Field: "RelatedPublicationIds",
        Kind: "related-publication",
        Quote: null,
        PublicationId: "pub-example-0102",
        Url: null,
        Note: null,
        RetrievedAt: "2026-10-01T12:00:00Z",
      },
    ],
  },
  ProblemDiscovery: {
    Problem: "Knowledge workers lose focus and output when they switch between tasks and meetings.",
    Customer: {
      Segment: "Public sector organizations with large knowledge-worker teams",
      Role: "Head of employee experience",
      Industry: "public-sector",
    },
    PainLevel: 4,
    PainRationale:
      "Lost focus time costs measurable output, and employers already pay for productivity tools.",
    Confidence: 0.6,
    Notes: null,
    Evidence: [
      {
        Field: "Problem",
        Kind: "publication-quote",
        Quote: "Frequent switching between tasks reduced sustained focus.",
        PublicationId: "pub-example-0001",
        Url: null,
        Note: null,
        RetrievedAt: "2026-10-01T12:00:00Z",
      },
      {
        Field: "PainRationale",
        Kind: "none-found",
        Quote: null,
        PublicationId: null,
        Url: null,
        Note: "The publication measures lost output but not what employers pay for tools.",
        RetrievedAt: "2026-10-01T12:00:00Z",
      },
    ],
  },
  MarketAnalysis: {
    TAM: {
      Low: {
        Amount: 8000000000,
        Currency: "EUR",
      },
      High: {
        Amount: 12000000000,
        Currency: "EUR",
      },
      Year: 2026,
      Geography: "global",
      Basis: "estimated",
    },
    SAM: {
      Low: {
        Amount: 2000000000,
        Currency: "EUR",
      },
      High: {
        Amount: 4000000000,
        Currency: "EUR",
      },
      Year: 2026,
      Geography: "EU",
      Basis: "estimated",
    },
    GrowthRate: {
      CagrPercent: 14,
      Period: "2026-2031",
      Basis: "estimated",
    },
    Method: "top-down",
    Assumptions: ["Productivity software spend per knowledge worker stays stable."],
    Confidence: 0.4,
    Notes: null,
    Evidence: [
      {
        Field: "TAM",
        Kind: "none-found",
        Quote: null,
        PublicationId: null,
        Url: null,
        Note: "No market study was found; the range is a top-down estimate.",
        RetrievedAt: "2026-10-01T12:00:00Z",
      },
    ],
  },
  Competition: {
    Competitors: [
      {
        Name: "Todoist",
        Kind: "indirect",
        Description: "Task manager",
        Verified: false,
      },
      {
        Name: "Motion",
        Kind: "direct",
        Description: "AI calendar and task scheduler",
        Verified: false,
      },
      {
        Name: "Asana",
        Kind: "indirect",
        Description: "Work management platform",
        Verified: false,
      },
    ],
    Saturation: 3,
    Gap: "Existing tools schedule tasks, but none plan focus blocks from measured switching patterns for knowledge-worker teams.",
    GapStrength: 3,
    Differentiation: "Plans focus blocks from measured switching patterns instead of static rules.",
    Confidence: 0.5,
    Notes: null,
    Evidence: [
      {
        Field: "Competitors",
        Kind: "none-found",
        Quote: null,
        PublicationId: null,
        Url: null,
        Note: "The competitors are named from general knowledge, not found by the search tool.",
        RetrievedAt: "2026-10-01T12:00:00Z",
      },
    ],
  },
  Relevance: {
    IndustryFit: {
      automotive: 40,
      "aerospace-defense": 35,
      "consumer-retail": 45,
      "energy-utilities": 40,
      banking: 50,
      insurance: 45,
      "public-sector": 80,
      "life-sciences": 30,
    },
    FocusMatch: {
      automotive: "none",
      "aerospace-defense": "none",
      "consumer-retail": "none",
      "energy-utilities": "none",
      banking: "none",
      insurance: "none",
      "public-sector": "clear",
      "life-sciences": "none",
    },
    TechnicalFeasibility: 80,
    ImplementationEffort: "M",
    Constraints: ["Calendar and activity data need employee consent."],
    Confidence: 0.6,
    Notes: null,
  },
  StartupGenerator: {
    StartupName: "AI Focus Planner",
    OpportunityType: "saas",
    ValueProposition:
      "Protects focus time by planning work around each person's switching patterns.",
    TargetCustomer: "Public sector organizations with large knowledge-worker teams",
    BusinessModel: "subscription",
    Pricing: {
      Model: "per-user",
      Price: {
        Amount: 15,
        Currency: "EUR",
      },
      Unit: "user per month",
    },
    USP: "Plans focus blocks from measured switching patterns instead of static rules.",
    MvpFeatures: ["Calendar integration", "Daily focus plan", "Switching report per team"],
    NextSteps: [
      "Interview five heads of employee experience about focus time.",
      "Test a calendar-only prototype with one internal team.",
      "Review consent requirements for activity data with a privacy officer.",
    ],
    BusinessCase: {
      Summary: "A per-user subscription for employers that already pay for productivity tools.",
      KeyAssumptions: [
        "Employers will share calendar data with a new vendor.",
        "Focus time gains can be shown within one quarter.",
      ],
      KeyRisks: [
        "Established calendar vendors add the same feature.",
        "Employees see activity sensing as surveillance.",
      ],
    },
    ValidationBrief: {
      Problem: {
        KillQuestion:
          "Do teams that switch often actually finish less work than teams that do not?",
        StopCriterion:
          "Drop it if the switching rate shows no link to finished work in two pilot teams.",
      },
      Customer: {
        KillQuestion: "Does a head of employee experience own the budget for focus tools?",
        StopCriterion: "Drop it if none of five interviewed heads controls such a budget.",
      },
      Market: {
        KillQuestion: "Do employers pay per user for productivity add-ons today?",
        StopCriterion: "Drop it if no employer in the interviews pays for one.",
      },
      ReasonToWin: {
        KillQuestion: "Can plans built from measured switching beat static focus rules?",
        StopCriterion: "Drop it if a pilot shows no more focus time than static rules.",
      },
      WhyNow: {
        KillQuestion: "Has anything changed that makes employers act on focus time now?",
        StopCriterion: "Drop it if no interviewed employer names a current reason to act.",
      },
    },
    Confidence: 0.5,
    Notes: null,
  },
};
