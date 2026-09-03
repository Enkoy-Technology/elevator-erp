'use client';

import { useMemo, useState } from 'react';

import { Sidebar } from '@/components/sidebar';

import {
  DOC_GROUPS,
  HERO_FACTS,
  type DocGroup,
  type DocSection,
  type Endpoint,
} from './content';

/** Everything a section says, flattened once so the filter is a substring test. */
const haystack = (section: DocSection): string =>
  [
    section.title,
    section.tagline,
    ...section.body,
    ...(section.rules ?? []),
    ...(section.facts ?? []).flatMap((f) => [f.label, f.value]),
    ...(section.flows ?? []).flatMap((f) => [f.title, ...f.steps, f.note ?? '']),
    ...(section.checks ?? []).flatMap((c) => [c.action, c.expect]),
    ...(section.endpoints ?? []).flatMap((e) => [e.path, e.roles, e.note]),
  ]
    .join(' ')
    .toLowerCase();

const METHOD_CLASS: Record<Endpoint['method'], string> = {
  GET: 'bg-sky-50 text-sky-700 ring-sky-200',
  POST: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  PATCH: 'bg-amber-50 text-amber-700 ring-amber-200',
  DELETE: 'bg-red-50 text-red-700 ring-red-200',
};

export default function DocsPage() {
  const [query, setQuery] = useState('');

  const groups = useMemo<DocGroup[]>(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return DOC_GROUPS;
    return DOC_GROUPS.map((group) => ({
      ...group,
      sections: group.sections.filter((s) => haystack(s).includes(needle)),
    })).filter((group) => group.sections.length > 0);
  }, [query]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-8 py-4">
          <div>
            <h1 className="font-display text-lg font-semibold">Documentation</h1>
            <p className="text-sm text-slate-500">
              Every module, flow and rule in the platform
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="relative">
              <span className="sr-only">Search the documentation</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search modules, endpoints, rules…"
                className="w-72 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-gold-500 focus:bg-white"
              />
            </label>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Print
            </button>
          </div>
        </header>

        <main className="flex-1 scroll-smooth bg-slate-50">
          <Hero />

          <div className="mx-auto grid max-w-7xl gap-10 px-8 py-10 lg:grid-cols-[210px_minmax(0,1fr)]">
            <TableOfContents groups={groups} />

            <div className="min-w-0 space-y-14">
              {groups.map((group) => (
                <section key={group.id} id={group.id} className="scroll-mt-24">
                  <div className="mb-6 border-l-[3px] border-gold-500 pl-4">
                    <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                      {group.title}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-slate-500">
                      {group.blurb}
                    </p>
                  </div>

                  <div className="space-y-6">
                    {group.sections.map((section) => (
                      <SectionCard key={section.id} section={section} />
                    ))}
                  </div>
                </section>
              ))}

              {groups.length === 0 && (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
                  Nothing matches “{query}”.
                </p>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <div className="relative overflow-hidden bg-navy-900 px-8 py-12 text-navy-100">
      {/* Brand wedges from the company profile, kept faint so text stays legible. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rotate-45 bg-gold-500/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 right-32 h-72 w-72 rotate-12 bg-gold-500/5"
      />
      <div className="relative mx-auto max-w-7xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-500">
          Shining Star ERP
        </p>
        <h2 className="font-display mt-3 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white">
          One system from the first site visit to the last maintenance visit.
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-navy-100/70">
          A multi-tenant ERP for elevator and electromechanical companies:
          engineering calculations, sales documents, Ethiopian-compliant
          finance, field maintenance and SMS — on one database that keeps every
          company&rsquo;s data to itself.
        </p>

        <dl className="mt-8 grid max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-xl bg-navy-800 sm:grid-cols-4">
          {HERO_FACTS.map((fact) => (
            <div key={fact.label} className="bg-navy-900 px-4 py-3">
              <dt className="text-[10px] uppercase tracking-wide text-navy-100/50">
                {fact.label}
              </dt>
              <dd className="font-display mt-1 text-xl font-bold text-gold-500">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function TableOfContents({ groups }: { groups: DocGroup[] }) {
  return (
    <nav className="hidden lg:block">
      <div className="sticky top-8 space-y-6">
        {groups.map((group) => (
          <div key={group.id}>
            <a
              href={`#${group.id}`}
              className="block text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 transition hover:text-slate-600"
            >
              {group.title}
            </a>
            <ul className="mt-2 space-y-px border-l border-slate-200">
              {group.sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="-ml-px block border-l border-transparent py-1 pl-3 text-[13px] text-slate-600 transition hover:border-gold-500 hover:text-slate-900"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

function SectionCard({ section }: { section: DocSection }) {
  return (
    <article
      id={section.id}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white"
    >
      <div className="flex items-start gap-4 border-b border-slate-100 px-6 py-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-gold-500">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden
          >
            <path d={section.icon} />
          </svg>
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold tracking-tight text-slate-900">
            {section.title}
          </h3>
          <p className="text-sm text-slate-500">{section.tagline}</p>
        </div>
      </div>

      <div className="space-y-6 px-6 py-6">
        <div className="max-w-3xl space-y-3">
          {section.body.map((paragraph) => (
            <p key={paragraph} className="text-[14px] leading-relaxed text-slate-700">
              {paragraph}
            </p>
          ))}
        </div>

        {section.facts && (
          <dl className="grid gap-px overflow-hidden rounded-xl bg-slate-200 sm:grid-cols-2 lg:grid-cols-3">
            {section.facts.map((fact) => (
              <div key={fact.label} className="bg-slate-50 px-4 py-3">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {fact.label}
                </dt>
                <dd className="mt-0.5 text-[13px] font-medium text-slate-800">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {section.flows?.map((flow) => (
          <div
            key={flow.title}
            className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-4"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
              {flow.title}
            </p>
            <ol className="mt-3 flex flex-wrap items-center gap-y-2">
              {flow.steps.map((step, index) => (
                <li key={step} className="flex items-center">
                  <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700">
                    {step}
                  </span>
                  {index < flow.steps.length - 1 && (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mx-1 h-3.5 w-3.5 shrink-0 text-gold-500"
                      aria-hidden
                    >
                      <path d="M5 12h14m-6-6 6 6-6 6" />
                    </svg>
                  )}
                </li>
              ))}
            </ol>
            {flow.note && (
              <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
                {flow.note}
              </p>
            )}
          </div>
        ))}

        {section.rules && (
          <ul className="space-y-2">
            {section.rules.map((rule) => (
              <li key={rule} className="flex gap-2.5 text-[13px] text-slate-700">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-[3px] h-3.5 w-3.5 shrink-0 text-gold-600"
                  aria-hidden
                >
                  <path d="m5 13 4 4L19 7" />
                </svg>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        )}

        {section.checks && (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="w-10 px-4 py-2 font-semibold">#</th>
                  <th className="px-4 py-2 font-semibold">Do this</th>
                  <th className="px-4 py-2 font-semibold">It worked if…</th>
                </tr>
              </thead>
              <tbody>
                {section.checks.map((check, index) => (
                  <tr key={check.action} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-2.5 font-mono text-[12px] text-slate-400">
                      {index + 1}
                    </td>
                    <td className="px-4 py-2.5 text-[12.5px] text-slate-700">
                      {check.action}
                    </td>
                    <td className="px-4 py-2.5 text-[12.5px] text-slate-500">
                      {check.expect}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {section.endpoints && (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-semibold">Endpoint</th>
                  <th className="px-4 py-2 font-semibold">Allowed roles</th>
                  <th className="px-4 py-2 font-semibold">What it does</th>
                </tr>
              </thead>
              <tbody>
                {section.endpoints.map((endpoint) => (
                  <tr
                    key={`${endpoint.method} ${endpoint.path}`}
                    className="border-t border-slate-100 align-top"
                  >
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span
                        className={`mr-2 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ring-1 ring-inset ${METHOD_CLASS[endpoint.method]}`}
                      >
                        {endpoint.method}
                      </span>
                      <code className="font-mono text-[12.5px] text-slate-800">
                        {endpoint.path}
                      </code>
                    </td>
                    <td className="px-4 py-2.5 text-[12.5px] text-slate-500">
                      {endpoint.roles}
                    </td>
                    <td className="px-4 py-2.5 text-[12.5px] text-slate-600">
                      {endpoint.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-400">
              CEO, GENERAL_MANAGER and ADMIN pass every role gate and are
              omitted from the lists above.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
