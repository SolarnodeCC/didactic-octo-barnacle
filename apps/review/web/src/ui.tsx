import { type ReactNode } from "react";

import { httpsOnly } from "./text.js";

export function ErrorNotice({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
    >
      {message}
    </p>
  );
}

/** An external link, rendered only for an `https` URL (REQ-NFR-013, ADR 0016). */
export function ExternalLink({ href, children }: { href: string | null; children: ReactNode }) {
  const safe = httpsOnly(href);
  if (!safe) return null;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-blue-700 hover:underline dark:text-blue-400"
    >
      {children}
    </a>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm">{children}</dd>
    </div>
  );
}
