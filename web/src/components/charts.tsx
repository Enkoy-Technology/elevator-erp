'use client';

import { useId, useState } from 'react';

/**
 * Two chart forms, both plain SVG. No charting library: a column chart and a
 * horizontal bar list are ~60 lines of geometry each, and a library would
 * bring its own tooltip, its own colour cycling and its own opinions about
 * axes — all three of which we would then have to override.
 *
 * Every series here is SINGLE-series, so colour does a sequential/ordinal
 * job, never an identity one: one hue, light→dark, from the `--color-viz-*`
 * ramp validated in globals.css. Nothing is ever coloured by rank, and no
 * legend is needed because the chart's own title names the series.
 *
 * Marks follow the house spec: 4px rounded data-ends anchored to the
 * baseline, a 2px surface gap between fills, recessive grid and axes, text
 * in ink tokens rather than the series colour, and selective direct labels
 * rather than a number on every mark.
 */

/** Compact ETB for an axis or a direct label — never for a total anyone reconciles. */
export const abbreviateEtb = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  }
  if (abs >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return String(Math.round(value));
};

const fullEtb = (value: number): string =>
  `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;

interface Point {
  /** The axis tick. NOT unique — month initials repeat (M, J, A). */
  label: string;
  /** Unique, and shown in the tooltip. Also the React key. */
  fullLabel: string;
  value: number;
}

/**
 * Columns over time. Emphasis form: the most recent period carries the
 * accent, every other period is the recessive step — so the eye lands on
 * "where are we now" without a second colour doing identity work.
 */
export const ColumnChart = ({
  points,
  height = 168,
}: {
  points: readonly Point[];
  height?: number;
}) => {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(...points.map((p) => p.value), 1);
  const plotH = height - 22; // room for the x labels
  const barW = 100 / points.length;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="h-[168px] w-full"
        role="img"
        aria-label={`Collections by month. Latest ${fullEtb(points[points.length - 1]?.value ?? 0)}.`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width="100" height={height} />
          </clipPath>
        </defs>

        {/* Recessive gridlines — quarters of the scale. */}
        {[0.25, 0.5, 0.75, 1].map((tick) => (
          <line
            key={tick}
            x1="0"
            x2="100"
            y1={plotH - tick * plotH}
            y2={plotH - tick * plotH}
            stroke="var(--color-slate-200)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <g clipPath={`url(#${clipId})`}>
          {points.map((point, index) => {
            const h = Math.max((point.value / max) * plotH, point.value > 0 ? 2 : 0);
            const isLatest = index === points.length - 1;
            const active = hover === index;
            return (
              <rect
                key={point.fullLabel}
                // The 2px surface gap between fills, expressed in the 0-100
                // viewBox so it survives preserveAspectRatio="none".
                x={index * barW + barW * 0.14}
                width={barW * 0.72}
                y={plotH - h}
                height={h}
                rx="1.2"
                fill={
                  active || isLatest ? 'var(--color-viz-1)' : 'var(--color-viz-3)'
                }
                opacity={hover === null || active ? 1 : 0.55}
                className="transition-opacity"
              />
            );
          })}
        </g>

        {/* Baseline the marks are anchored to. */}
        <line
          x1="0"
          x2="100"
          y1={plotH}
          y2={plotH}
          stroke="var(--color-slate-300)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Hit targets and x labels in HTML — bigger than the marks, and text
          that never inherits the viewBox's non-uniform scaling. */}
      <div className="absolute inset-0 flex">
        {points.map((point, index) => (
          <button
            key={point.fullLabel}
            type="button"
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(index)}
            onBlur={() => setHover(null)}
            className="group relative flex-1 cursor-default"
            aria-label={`${point.fullLabel}: ${fullEtb(point.value)}`}
          >
            <span className="absolute inset-x-0 bottom-0 text-center font-mono text-[9px] uppercase tracking-wide text-slate-400">
              {point.label}
            </span>
          </button>
        ))}
      </div>

      {hover !== null && points[hover] ? (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-navy-900 px-2.5 py-1.5 text-center shadow-lg"
          style={{ left: `${((hover + 0.5) / points.length) * 100}%` }}
        >
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/60">
            {points[hover].fullLabel}
          </p>
          <p className="font-display text-xs font-semibold text-white">
            {fullEtb(points[hover].value)}
          </p>
        </div>
      ) : null}
    </div>
  );
};

/**
 * Horizontal bars for an ordered set — pipeline stages, ageing buckets.
 * Long category names are why this goes horizontal rather than vertical.
 * `tone` walks the ordinal ramp so position on the scale is encoded twice
 * (length and darkness), which is what keeps it readable in greyscale.
 */
export const BarList = ({
  rows,
  emptyNote,
}: {
  rows: readonly {
    label: string;
    value: number;
    /** Right-hand annotation: a count, a share, whatever the row is about. */
    note?: string;
    /** 1-5 on the ordinal ramp. */
    tone?: 1 | 2 | 3 | 4 | 5;
    href?: string;
  }[];
  emptyNote?: string;
}) => {
  const max = Math.max(...rows.map((r) => r.value), 1);
  const allZero = rows.every((r) => r.value === 0);

  if (allZero && emptyNote) {
    return <p className="py-6 text-center text-sm text-slate-500">{emptyNote}</p>;
  }

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const pct = (row.value / max) * 100;
        const body = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] text-slate-700">{row.label}</span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-500">
                {row.note ?? abbreviateEtb(row.value)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.max(pct, row.value > 0 ? 3 : 0)}%`,
                  background: `var(--color-viz-${row.tone ?? 2})`,
                }}
              />
            </div>
          </>
        );
        return (
          <li key={row.label}>
            {row.href ? (
              <a href={row.href} className="block rounded-lg outline-none transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-gold-500/40">
                {body}
              </a>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
};
