/** Pilot arXiv categories from docs/kt/data-sources/ingestion-scope.md. */
export const PILOT_ARXIV_CATEGORIES = ["cs.AI", "cs.SE", "cs.HC", "cs.CY"] as const;

export function isArxivCategoryInScope(
  categories: string[],
  allowed: readonly string[] = PILOT_ARXIV_CATEGORIES,
): boolean {
  const allowedSet = new Set(allowed.map((value) => value.toLowerCase()));
  return categories.some((category) => allowedSet.has(category.toLowerCase()));
}

export function isOpenAlexTopicsInScope(
  topicNames: string[],
  allowedNames: readonly string[],
): boolean {
  const allowed = new Set(allowedNames.map((value) => value.toLowerCase()));
  return topicNames.some((name) => allowed.has(name.toLowerCase()));
}
