import { Check } from 'lucide-react';

import { StatusPill } from '@/components/list-toolbar';
import type { AssetStatus } from '@/lib/api';
import { ASSET_JOURNEY, ASSET_STATUS_LABEL, ASSET_STATUS_TONE } from './labels';

/** The road from the factory to the building, and where this lift is on it. */
export const LiftJourney = ({ status }: { status: AssetStatus }) => {
  const at = ASSET_JOURNEY.indexOf(status);
  if (at < 0) {
    return (
      <StatusPill
        label={ASSET_STATUS_LABEL[status]}
        tone={ASSET_STATUS_TONE[status]}
      />
    );
  }
  return (
    <ol className="flex">
      {ASSET_JOURNEY.map((step, position) => {
        const done = position < at;
        const here = position === at;
        return (
          <li
            key={step}
            aria-current={here ? 'step' : undefined}
            className="relative min-w-0 flex-1 text-center"
          >
            {position < ASSET_JOURNEY.length - 1 ? (
              <span
                aria-hidden
                className={`absolute left-1/2 top-3 h-0.5 w-full -translate-y-1/2 ${done ? 'bg-navy-900' : 'bg-slate-300'}`}
              />
            ) : null}
            <span
              aria-hidden
              className={`relative mx-auto flex h-6 w-6 items-center justify-center rounded-full ${
                here
                  ? 'bg-gold-500 ring-4 ring-gold-500/25'
                  : done
                    ? 'bg-navy-900 text-white'
                    : 'border-2 border-slate-300 bg-white'
              }`}
            >
              {done ? <Check strokeWidth={3} className="h-3.5 w-3.5" /> : null}
            </span>
            <span
              className={`mt-1.5 block text-[11px] leading-tight sm:text-xs ${here ? 'font-bold text-slate-900' : 'text-slate-500'}`}
            >
              {ASSET_STATUS_LABEL[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
};
