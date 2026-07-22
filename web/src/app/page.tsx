'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Sidebar } from '@/components/sidebar';
import { MODULES } from '@/components/module-nav';
import {
  AuthProfile,
  getAccessToken,
  getHealth,
  getProfile,
  logout,
} from '@/lib/api';

const ROLE_LABELS: Record<string, string> = {
  CEO: 'Chief Executive',
  SALES_MANAGER: 'Sales Manager',
  TECHNICAL_LEAD: 'Technical Lead',
  FIELD_ENGINEER: 'Field Engineer',
  FINANCE: 'Finance',
  WAREHOUSE_MANAGER: 'Warehouse Manager',
  DISPATCHER: 'Dispatcher',
  CUSTOMER: 'Customer',
  ADMIN: 'Administrator',
};

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [apiUp, setApiUp] = useState<boolean | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    getProfile()
      .then(setProfile)
      .catch(() => router.replace('/login'));
    void getHealth().then(setApiUp);
  }, [router]);

  const onLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Loading your workspace…</p>
      </main>
    );
  }

  const initials = profile.fullName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
          <div>
            <h1 className="font-display text-lg font-semibold">Dashboard</h1>
            <p className="text-xs text-slate-500">
              Workspace overview and delivery roadmap
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span
              className={
                apiUp === false
                  ? 'flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700'
                  : 'flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700'
              }
            >
              <span
                className={
                  apiUp === false
                    ? 'h-1.5 w-1.5 rounded-full bg-red-500'
                    : 'h-1.5 w-1.5 rounded-full bg-emerald-500'
                }
              />
              {apiUp === false ? 'API offline' : 'API online'}
            </span>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-xs font-bold text-white">
                {initials}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium leading-tight">
                  {profile.fullName}
                </p>
                <p className="text-xs text-slate-500">
                  {ROLE_LABELS[profile.role] ?? profile.role}
                </p>
              </div>
            </div>
            <button
              onClick={() => void onLogout()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 space-y-8 px-8 py-8">
          <section className="rounded-2xl bg-navy-800 p-6 text-white">
            <p className="text-sm text-navy-100/70">Welcome back,</p>
            <h2 className="font-display mt-0.5 text-2xl font-semibold tracking-tight">
              {profile.fullName}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-navy-100/80">
              Signed in as{' '}
              <span className="font-medium text-gold-400">
                {profile.email}
              </span>{' '}
              ·{' '}
              <span className="font-medium text-gold-400">
                {ROLE_LABELS[profile.role] ?? profile.role}
              </span>
              . Use the sidebar for calculator, customers, projects, and
              quotations.
            </p>
          </section>

          <section>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Quick links
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {MODULES.filter((module) => module.href && module.href !== '/').map(
                (module) => (
                  <a
                    key={module.name}
                    href={module.href!}
                    className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-navy-600/40 hover:shadow-sm"
                  >
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-navy-800/5 text-navy-800">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-5 w-5"
                      >
                        <path d={module.icon} />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold">{module.name}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {module.description}
                    </p>
                  </a>
                ),
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
