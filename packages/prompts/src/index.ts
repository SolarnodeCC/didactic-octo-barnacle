export { CLOSE_TAG, DATA_NOT_INSTRUCTIONS, OPEN_TAG, defuseTags, delimit } from "./delimiters.js";

export { modelConfig, type BuiltPrompt, type Sampling } from "./prompt.js";

export {
  TRIAGE_CONTRACT,
  TRIAGE_PROMPT_VERSION,
  TRIAGE_SAMPLING,
  TRIAGE_SYSTEM,
  buildTriagePrompt,
  type TriageInput,
} from "./triage.js";

export {
  DEFAULT_FULL_TEXT_MAX_CHARS,
  EXTRACTION_PROMPT_VERSION,
  EXTRACTION_SAMPLING,
  buildExtractionPrompt,
  extractionContract,
  extractionSystem,
  type ExtractionInput,
} from "./extraction.js";

export { TARGET_INDUSTRY_FOCUS, industryLines } from "./industries.js";

export {
  RESEARCH_ANALYST_CONTRACT,
  RESEARCH_ANALYST_PROMPT_VERSION,
  RESEARCH_ANALYST_SAMPLING,
  RESEARCH_ANALYST_SYSTEM,
  buildResearchAnalystPrompt,
  type RelatedPublication,
  type ResearchAnalystInput,
} from "./research-analyst.js";

export {
  PROBLEM_DISCOVERY_CONTRACT,
  PROBLEM_DISCOVERY_PROMPT_VERSION,
  PROBLEM_DISCOVERY_SAMPLING,
  PROBLEM_DISCOVERY_SYSTEM,
  buildProblemDiscoveryPrompt,
  type ProblemDiscoveryInput,
} from "./problem-discovery.js";

export {
  RELEVANCE_CONTRACT,
  RELEVANCE_PROMPT_VERSION,
  RELEVANCE_SAMPLING,
  RELEVANCE_SYSTEM,
  buildRelevancePrompt,
  type RelevanceInput,
} from "./relevance.js";
