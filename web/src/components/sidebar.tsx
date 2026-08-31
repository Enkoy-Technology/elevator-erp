'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getAccessToken, getCurrentRole, getProfile, logout, type AuthProfile } from '@/lib/api';

import { useLocale } from './locale-provider';
import { MODULE_GROUPS, modulesForRole, type ModuleNavItem } from './module-nav';
import { toggleCollapsed, toggleHidden, useSidebarState } from './sidebar-state';
import mark from '../../public/shining-star-mark.png';

/** 'SALES_MANAGER' -> 'Sales manager' — the role as a person would say it. */
const readableRole = (role: string): string => {
  const words = role.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const initialsOf = (fullName: string): string =>
  fullName
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, hidden } = useSidebarState();
  const { t } = useLocale();
  // Read after mount: localStorage is unavailable during the server render.
  const [modules, setModules] = useState(() => modulesForRole(null));
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  useEffect(() => {
    setModules(modulesForRole(getCurrentRole()));
  }, [pathname]);

  useEffect(() => {
    if (!getAccessToken()) {
      return;
    }
    let alive = true;
    getProfile()
      .then((next) => {
        if (alive) {
          setProfile(next);
        }
      })
      // The page's own auth effect owns the redirect; the shell just goes
      // anonymous rather than throwing on a dead session.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (hidden) {
    return (
      <button
        type="button"
        onClick={toggleHidden}
        title={t('nav.show')}
        aria-label={t('nav.show')}
        className="fixed left-3 top-3 z-40 flex items-center gap-2 rounded-lg bg-navy-900 px-2.5 py-2 text-white shadow-lg transition hover:bg-navy-800 print:hidden"
      >
        <Icon path="M3 6h18M3 12h18M3 18h18" className="h-4 w-4" />
        <span className="sr-only">{t('nav.show')}</span>
      </button>
    );
  }

  const onSignOut = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-navy-800 bg-navy-950 text-navy-100 transition-[width] duration-200 motion-reduce:transition-none print:hidden ${
        collapsed ? 'w-16' : 'w-16 sm:w-64'
      }`}
    >
      <div
        className={`flex items-center gap-2.5 border-b border-navy-800 py-4 ${
          collapsed ? 'justify-center px-0' : 'justify-center px-0 sm:justify-start sm:px-4'
        }`}
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
          <div className="hidden min-w-0 sm:block">
            <p className="font-display truncate text-sm font-bold tracking-tight text-white">
              Shining Star
            </p>
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-navy-100/50">
              {t('brand.subtitle')}
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4">
        {MODULE_GROUPS.map(({ key, labelKey }) => {
          const items = modules.filter((module) => module.group === key);
          if (items.length === 0) {
            return null;
          }
          const label = t(labelKey);
          return (
            <div key={key} role="group" aria-label={label}>
              {collapsed ? (
                <div className="mx-auto my-3 h-px w-6 bg-navy-800" aria-hidden />
              ) : (
                <>
                  <div
                    className="mx-auto my-3 h-px w-6 bg-navy-800 sm:hidden"
                    aria-hidden
                  />
                  <p className="hidden px-3 pb-1.5 pt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-navy-100/40 sm:block">
                    {label}
                  </p>
                </>
              )}
              <div className="space-y-0.5">
                {items.map((module) => (
                  <NavItem
                    key={module.nameKey}
                    module={module}
                    label={t(module.nameKey)}
                    collapsed={collapsed}
                    pathname={pathname}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-navy-800">
        <div
          className={`flex items-center gap-2.5 ${
            collapsed
              ? 'flex-col px-0 py-3'
              : 'flex-col px-0 py-3 sm:flex-row sm:px-3'
          }`}
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-800 font-display text-[11px] font-bold text-gold-500"
            title={profile?.fullName ?? ''}
          >
            {profile ? initialsOf(profile.fullName) : '—'}
          </div>
          {!collapsed && (
            <div className="hidden min-w-0 flex-1 sm:block">
              <p className="truncate text-[13px] font-medium text-white">
                {profile?.fullName ?? '…'}
              </p>
              <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-navy-100/45">
                {profile ? readableRole(profile.role) : ''}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => void onSignOut()}
            title={t('nav.signOut')}
            aria-label={t('nav.signOut')}
            className="shrink-0 rounded-lg p-2 text-navy-100/60 transition hover:bg-navy-800 hover:text-white"
          >
            <Icon
              path="M15 12H3m0 0 4-4m-4 4 4 4M13 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"
              className="h-4 w-4"
            />
          </button>
        </div>

        <div
          className={`border-t border-navy-800 ${
            collapsed
              ? 'flex flex-col items-center gap-1 py-2'
              : 'flex flex-col items-center gap-1 py-2 sm:flex-row sm:justify-between sm:px-3'
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
              className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${collapsed ? 'rotate-180' : ''}`}
            />
            {!collapsed && (
              <span className="hidden sm:inline">{t('nav.collapse')}</span>
            )}
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
      </div>
    </aside>
  );
}

function NavItem({
  module,
  label,
  collapsed,
  pathname,
}: {
  module: ModuleNavItem;
  label: string;
  collapsed: boolean;
  pathname: string;
}) {
  const locked = module.phase !== null || !module.href;
  const active =
    !!module.href &&
    (module.href === '/' ? pathname === '/' : pathname.startsWith(module.href));

  const layout = collapsed
    ? 'justify-center px-0'
    : 'justify-center px-0 sm:justify-start sm:gap-3 sm:px-3';
  // The active item is the one place brand orange appears in the nav: a
  // hard-edged marker echoing the wedges in the company profile — a rule
  // against the item, never a filled orange block.
  const stateClass = locked
    ? 'text-navy-100/35'
    : active
      ? 'bg-white/[0.05] font-semibold text-gold-500 before:absolute before:left-0 before:top-1/2 before:h-6 before:w-[3px] before:-translate-y-1/2 before:bg-gold-500'
      : 'text-navy-100/70 transition hover:bg-white/[0.06] hover:text-white';
  const className = `relative flex items-center rounded-lg py-2.5 ${layout} ${stateClass}`;

  const content = (
    <>
      <Icon path={module.icon} className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && (
        <>
          <span className="hidden flex-1 truncate text-[13px] font-medium sm:block">
            {label}
          </span>
          {locked && module.phase !== null && (
            <span className="hidden rounded-full bg-navy-800 px-2 py-0.5 text-[10px] font-semibold text-gold-400 sm:inline">
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
      <div className={className} title={title}>
        {content}
      </div>
    );
  }

  return (
    <Link
      href={module.href}
      className={className}
      title={title}
      // The label is display:none when the rail is icon-only, which takes it
      // out of the accessibility tree with it — name the link explicitly.
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      {content}
    </Link>
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
