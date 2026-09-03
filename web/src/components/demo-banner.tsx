/**
 * The legal notice on the free public demo. Rendered on every page by
 * `app/layout.tsx` when `isDemoMode()` says so, and never in the on-prem
 * production build.
 *
 * Ethiopian Personal Data Protection Proclamation 1321/2024 Art 22(1)
 * requires personal data collected in Ethiopia to be stored on a server in
 * Ethiopia. The demo runs on Cloud Run and Neon, both abroad, so it is
 * lawful only while every row in it is invented. Do not remove or soften
 * this text; someone clicking through for twenty minutes has to still know.
 *
 * A slim bar rather than a modal, in the brand's own vocabulary: orange
 * carries black text (on #fb9d19 black reads ~11:1, white ~2.2:1), and the
 * mono uppercase tag is the same eyebrow every page header uses. It is
 * deliberately NOT `print:hidden` — a demo quotation that gets printed
 * should carry the warning onto the paper.
 */
export const DemoBanner = () => (
  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-black/25 bg-gold-500 px-4 py-1.5 text-black sm:px-6">
    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em]">
      Demo
    </span>
    <p className="min-w-0 text-[12px] leading-snug">
      <strong className="font-semibold">
        Demonstration system — every record here is fictional.
      </strong>{' '}
      Do not enter real customer, employee or supplier details: this server is
      outside Ethiopia, where Proclamation 1321/2024 (Art 22) requires personal
      data collected in Ethiopia to stay.
    </p>
  </div>
);
