import { type TargetIndustry } from "@roi/models";

/**
 * The eight target industries and their focus areas, word for word from the Target industries
 * table of docs/kt/overview.md (ADR 0037). An organization profile replaces them later
 * (REQ-DASH-005).
 */
export const TARGET_INDUSTRY_FOCUS: ReadonlyArray<[TargetIndustry, string]> = [
  [
    "automotive",
    "Software-defined and connected vehicles, predictive maintenance, manufacturing quality, supply-chain resilience, driver-assistance safety validation, dealer and customer service",
  ],
  [
    "aerospace-defense",
    "Maintenance, repair and overhaul, certification and airworthiness evidence, supply-chain traceability, mission planning and decision support, secure engineering",
  ],
  [
    "consumer-retail",
    "Demand forecasting, personalization and merchandising, inventory and supply chain, customer service automation, product quality, loss prevention",
  ],
  [
    "energy-utilities",
    "Grid and asset monitoring, demand forecasting, predictive maintenance, field-workforce planning, regulatory and emissions reporting, customer engagement",
  ],
  [
    "banking",
    "Risk management, fraud prevention, compliance automation (AML, KYC), customer service automation, credit decisioning",
  ],
  [
    "insurance",
    "Claims automation, underwriting and risk assessment, fraud detection, customer service, regulatory compliance",
  ],
  [
    "public-sector",
    "Public services, digital citizens, case management, self-service platforms, fraud detection, AI assistants",
  ],
  [
    "life-sciences",
    "Drug discovery and development support, clinical trials, regulatory submissions and pharmacovigilance, diagnostics and medical devices, GxP manufacturing quality, real-world evidence",
  ],
];

/** The industry lines of a prompt: `- <value>: <focus areas>`. */
export function industryLines(): string[] {
  return TARGET_INDUSTRY_FOCUS.map(([value, focus]) => `- ${value}: ${focus}.`);
}
