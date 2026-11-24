import { DetailPage } from "./DetailPage.js";
import { ListPage } from "./ListPage.js";
import { Link, useLocation } from "./router.js";
import { StatsPage } from "./StatsPage.js";

const DETAIL = /^\/p\/([^/]+)$/u;

export function App() {
  const { Path, Search } = useLocation();
  const detail = DETAIL.exec(Path);
  const linkClass = (active: boolean) =>
    `rounded px-3 py-1.5 text-sm font-medium ${
      active
        ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
        : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
    }`;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 py-4 dark:border-slate-800">
        <div>
          <h1 className="text-lg font-semibold">Output review</h1>
          <p className="text-xs text-slate-500">Triage and extraction output · staging</p>
        </div>
        <nav className="flex gap-1">
          <Link href="/" className={linkClass(Path === "/" || detail !== null)}>
            Publications
          </Link>
          <Link href="/stats" className={linkClass(Path === "/stats")}>
            Summary
          </Link>
        </nav>
      </header>
      <main className="pt-6">
        {detail ? (
          <DetailPage key={detail[1]} id={decodeURIComponent(detail[1] as string)} />
        ) : Path === "/stats" ? (
          <StatsPage />
        ) : (
          <ListPage search={Search} />
        )}
      </main>
    </div>
  );
}
