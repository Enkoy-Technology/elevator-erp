'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getCurrentRole } from '@/lib/api';

import { useLocale } from './locale-provider';
import { modulesForRole } from './module-nav';
import { toggleCollapsed, toggleHidden, useSidebarState } from './sidebar-state';
import mark from '../../public/shining-star-mark.png';

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, hidden } = useSidebarState();
  const { t } = useLocale();
  // Read after mount: localStorage is unavailable during the server render.
  const [modules, setModules] = useState(() => modulesForRole(null));

  useEffect(() => {
    setModules(modulesForRole(getCurrentRole()));
  }, [pathname]);

  if (hidden) {
    return (
      <button
        type="button"
        onClick={toggleHidden}
        title={t('nav.show')}
        aria-label={t('nav.show')}
        className="fixed left-3 top-3 z-40 flex items-center gap-2 rounded-lg bg-navy-900 px-2.5 py-2 text-white shadow-lg transition hover:bg-navy-800"
      >
        <Icon path="M3 6h18M3 12h18M3 18h18" className="h-4 w-4" />
        <span className="sr-only">{t('nav.show')}</span>
      </button>
    );
  }

  return (
    <aside
      className={`flex shrink-0 flex-col bg-navy-900 text-navy-100 transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div
        className={`flex items-center gap-2.5 py-4 ${collapsed ? 'justify-center px-0' : 'px-4'}`}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white p-1">
          <Image
            src={mark}
            alt="Shining Star Electromechanical"
            priority
            className="h-full w-full object-contain"
          />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-display truncate text-sm font-bold tracking-tight text-white">
              Shining Star
            </p>
            <p className="truncate text-[10px] uppercase tracking-wide text-navy-100/60">
              {t('brand.subtitle')}
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-3 pb-4">
        {modules.map((module) => {
          const label = t(module.nameKey);
          const locked = module.phase !== null || !module.href;
          const active =
            !!module.href &&
            (module.href === '/'
              ? pathname === '/'
              : pathname.startsWith(module.href));

          const layout = collapsed ? 'justify-center px-0' : 'gap-3 px-3';
          // The active item is the one place brand orange appears in the nav:
          // a hard-edged marker echoing the wedges in the company profile.
          const stateClass = locked
            ? 'text-navy-100/40'
            : active
              ? 'bg-navy-800 font-semibold text-gold-500 before:absolute before:left-0 before:top-1/2 before:h-6 before:w-[3px] before:-translate-y-1/2 before:bg-gold-500'
              : 'text-navy-100/70 transition hover:bg-navy-800 hover:text-white';
          const className = `relative flex items-center rounded-lg py-2.5 ${layout} ${stateClass}`;

          const content = (
            <>
              <Icon path={module.icon} className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate text-[13px] font-medium">
                    {label}
                  </span>
                  {locked && module.phase !== null && (
                    <span className="rounded-full bg-navy-800 px-2 py-0.5 text-[10px] font-semibold text-gold-400">
                      P{module.phase}
                    </span>
                  )}
                </>
              )}
            </>
          );

          const title = collapsed ? label : module.description;

          if (locked || !module.href) {
            return (
              <div key={module.nameKey} className={className} title={title}>
                {content}
              </div>
            );
          }

          return (
            <Link
              key={module.nameKey}
              href={module.href}
              className={className}
              title={title}
            >
              {content}
            </Link>
          );
        })}
      </nav>

      <div
        className={`border-t border-navy-800 ${
          collapsed
            ? 'flex flex-col items-center gap-1 py-2'
            : 'flex items-center justify-between px-3 py-2'
        }`}
      >
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium text-navy-100/60 transition hover:bg-navy-800 hover:text-white"
        >
          <Icon
            path="m11 17-5-5 5-5M18 17l-5-5 5-5"
            className={`h-4 w-4 shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`}
          />
          {!collapsed && <span>{t('nav.collapse')}</span>}
        </button>
        <button
          type="button"
          onClick={toggleHidden}
          title={t('nav.hide')}
          aria-label={t('nav.hide')}
          className="rounded-lg p-1.5 text-navy-100/60 transition hover:bg-navy-800 hover:text-white"
        >
          <Icon path="M18 6 6 18M6 6l12 12" className="h-4 w-4 shrink-0" />
        </button>
      </div>
    </aside>
  );
}

function Icon({ path, className }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}
