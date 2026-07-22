import { MODULES } from './module-nav';

export function Sidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col bg-navy-900 text-navy-100">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold-500 text-lg font-black text-navy-900">
          E
        </div>
        <div>
          <p className="font-display text-sm font-bold tracking-tight text-white">
            Elevator ERP
          </p>
          <p className="text-[11px] text-navy-100/60">Admin console</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {MODULES.map((module) => {
          const locked = module.phase !== null;
          return (
            <div
              key={module.name}
              className={
                locked
                  ? 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-navy-100/40'
                  : 'flex items-center gap-3 rounded-lg bg-navy-700 px-3 py-2.5 text-white'
              }
              title={module.description}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[18px] w-[18px] shrink-0"
              >
                <path d={module.icon} />
              </svg>
              <span className="flex-1 truncate text-[13px] font-medium">
                {module.name}
              </span>
              {locked && (
                <span className="rounded-full bg-navy-800 px-2 py-0.5 text-[10px] font-semibold text-gold-400">
                  P{module.phase}
                </span>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-navy-800 px-5 py-4 text-[11px] text-navy-100/50">
        Phase badges show when each module ships.
      </div>
    </aside>
  );
}
