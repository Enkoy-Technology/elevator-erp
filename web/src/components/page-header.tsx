import type { ReactNode } from 'react';

import { metaLabelClass } from './form-styles';

interface PageHeaderProps {
  title: string;
  /** One line saying what the screen is for. */
  description?: string;
  /** Mono eyebrow above the title — the module this screen belongs to. */
  eyebrow?: string;
  /** Right-hand action row. Exactly one of these should be `btnPrimary`. */
  actions?: ReactNode;
}

/**
 * The one page header for every list screen: same height, same type ramp,
 * same place for the primary action. Sits directly under the app shell, above
 * the page's own `<main>`.
 */
export const PageHeader = ({
  title,
  description,
  eyebrow,
  actions,
}: PageHeaderProps) => (
  <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow ? <p className={`mb-1.5 ${metaLabelClass}`}>{eyebrow}</p> : null}
        <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  </header>
);
