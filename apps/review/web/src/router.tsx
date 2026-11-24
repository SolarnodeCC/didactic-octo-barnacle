import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

/** A tiny history router: the tool has three pages, so no routing library is needed. */

const listeners = new Set<() => void>();

export function navigate(path: string): void {
  window.history.pushState(null, "", path);
  for (const listener of listeners) listener();
}

export function useLocation(): { Path: string; Search: URLSearchParams } {
  const read = () => ({
    Path: window.location.pathname,
    Search: new URLSearchParams(window.location.search),
  });
  const [location, setLocation] = useState(read);
  useEffect(() => {
    const update = () => setLocation(read());
    listeners.add(update);
    window.addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return location;
}

export function Link({
  href,
  onClick,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...rest} />;
}
