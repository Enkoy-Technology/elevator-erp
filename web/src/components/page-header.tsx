import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
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
  /** Where "Back" goes: the list or record this screen belongs to. Every
   *  detail screen has one; list screens have none. */
  backHref?: string;
  backLabel?: string;
}

/** The back control, shared with FormPage so every screen's "back" looks the same. */
export const BackLink = ({ href, label }: { href: string; label: string }) => (
  <Link
    href={href}
    className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
  >
    <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
    {label}
  </Link>
);

/**
 * The one page header for every screen: same height, same type ramp, same
 * place for the primary action, same back control. Sits directly under the
 * app shell, above the page's own `<main>`.
 */
export const PageHeader = ({
  title,
  description,
  eyebrow,
  actions,
  backHref,
  backLabel,
}: PageHeaderProps) => (
  <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
    {backHref ? <BackLink href={backHref} label={backLabel ?? 'Back'} /> : null}
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
