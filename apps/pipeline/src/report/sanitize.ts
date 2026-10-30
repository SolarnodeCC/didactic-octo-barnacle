const MAX_REASON_LENGTH = 160;

/**
 * Shortens a failure reason before it appears in a report or an alert (REQ-NFR-019 AC4).
 * Reasons come from our own error messages; links are replaced, long tokens are cut, and
 * the text is capped, so nothing that looks like content or a credential is passed on.
 */
export function sanitizeReason(reason: string): string {
  const cleaned = reason
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[token]")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > MAX_REASON_LENGTH
    ? `${cleaned.slice(0, MAX_REASON_LENGTH - 1)}…`
    : cleaned;
}
