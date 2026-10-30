/**
 * Reconstruct an OpenAlex abstract from abstract_inverted_index (REQ-DATA-001).
 * The index maps each token to the list of character positions where it appears.
 */
export type AbstractInvertedIndex = Record<string, number[]>;

export function reconstructAbstract(
  invertedIndex: AbstractInvertedIndex | null | undefined,
): string | null {
  if (!invertedIndex || Object.keys(invertedIndex).length === 0) {
    return null;
  }

  const positions: Array<{ token: string; index: number }> = [];
  for (const [token, indexes] of Object.entries(invertedIndex)) {
    for (const index of indexes) {
      positions.push({ token, index });
    }
  }

  positions.sort((a, b) => a.index - b.index);
  return positions.map((entry) => entry.token).join(" ");
}
