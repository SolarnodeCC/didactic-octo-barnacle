export { reconstructAbstract } from "./collectors/openalex/abstract.js";
export { mapOpenAlexWork } from "./collectors/openalex/map-work.js";
export { mapArxivEntry } from "./collectors/arxiv/map-entry.js";
export { decideMerge } from "./normalize/dedupe-merge.js";
export { normalizePdfLicense } from "./normalize/license.js";
export { isArxivCategoryInScope, PILOT_ARXIV_CATEGORIES } from "./normalize/scope.js";
