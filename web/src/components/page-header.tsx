import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Where you are: module / parent / this record. The parent is the link back,
 * so every record screen and form has the same way home, in the same place.
 */
export const Breadcrumb = ({
  root,
  parentHref,
  parentLabel,
  current,
}: {
  root?: string;
  parentHref?: string;
  parentLabel?: string;
  current: string;
}) => (
  <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
    {root && root !== parentLabel ? (
      <>
        <span className="shrink-0 text-slate-500">{root}</span>
        <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </>
    ) : null}
    {parentHref && parentLabel ? (
      <>
        <Link
          href={parentHref}
          className="shrink-0 rounded px-1 text-slate-600 underline-offset-2 hover:bg-slate-100 hover:text-slate-900 hover:underline"
        >
          {parentLabel}
        </Link>
        <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </>
    ) : null}
    <span className="truncate font-semibold text-slate-900">{current}</span>
  </nav>
);

interface PageHeaderProps {
  title: string;
  /** One line saying what the screen is for. */
  description?: string;
  /** The module this screen belongs to — the root of the breadcrumb. */
  eyebrow?: string;
  /** Right-hand action row. Exactly one of these should be `btnPrimary`. */
  actions?: ReactNode;
  /** The list or record this screen belongs to. Every record screen has one. */
  backHref?: string;
  backLabel?: string;
}

/**
 * The one page header for every screen: breadcrumb on the left, actions on
 * the right, the title beneath. Sits directly under the app shell, above
 * the page's own `<main>`.
 */
export const PageHeader = ({
  title,
  description,
  eyebrow,
  actions,
  backHref,
  backLabel,
}: PageHeaderProps) => (
  <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
      <div className="min-w-0 flex-1">
        {backHref ? (
          <Breadcrumb root={eyebrow} parentHref={backHref} parentLabel={backLabel} current={title} />
        ) : (
          // A list is the top of its module: the title below is the crumb.
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        )}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
    {backHref || description ? (
      <div className="px-4 pb-4 sm:px-6">
        {backHref ? (
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        ) : null}
        {description ? <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p> : null}
      </div>
    ) : null}
  </header>
);
