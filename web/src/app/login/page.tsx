'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

import { ApiError, login } from '@/lib/api';
// Unsplash (free licence, no attribution required):
// https://unsplash.com/photos/713E0LsFGz0
// Swap in one of Shining Star's own installation photos when there is one —
// same filename, same dimensions, nothing else to change.
import lobby from '../../../public/lift-lobby.jpg';
import logo from '../../../public/shining-star-logo.jpg';

// Demo credentials are a dev convenience only; production builds ship an
// empty form and no hint. NODE_ENV is inlined at build time.
const IS_DEV = process.env.NODE_ENV !== 'production';

export default function LoginPage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState(IS_DEV ? 'demo' : '');
  const [email, setEmail] = useState(IS_DEV ? 'ceo@demo.example.com' : '');
  const [password, setPassword] = useState(IS_DEV ? 'Demo!Passw0rd' : '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(tenantSlug.trim(), email.trim(), password);
      router.replace('/');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Can’t reach the server. Check your connection and try again.',
      );
      setSubmitting(false);
    }
  };

  const label =
    'mb-2 block font-mono text-[11px] uppercase tracking-[0.14em] text-navy-600';
  const field =
    'w-full rounded-lg border border-navy-100 bg-white px-4 py-3 text-sm text-navy-950 ' +
    'outline-none transition placeholder:text-navy-600/50 ' +
    'focus:border-gold-500 focus:ring-4 focus:ring-gold-500/15';

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Left: the work itself */}
      <aside className="relative hidden overflow-hidden bg-navy-950 lg:block">
        <Image
          src={lobby}
          alt="Lift lobby with bronze landing doors"
          placeholder="blur"
          priority
          sizes="52vw"
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Scrims only where type sits, so the photo keeps its contrast between */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-navy-950 via-navy-950/80 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-navy-950/75 to-transparent"
        />

        <div className="relative flex h-full flex-col justify-between p-12">
          <header className="flex items-center gap-4">
            <div className="w-14 shrink-0 overflow-hidden rounded-xl bg-white p-1.5">
              <Image src={logo} alt="" priority className="h-auto w-full" />
            </div>
            <div>
              <p className="font-display text-base font-bold leading-tight tracking-tight text-white">
                Shining Star
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold-400">
                Electromechanical
              </p>
            </div>
          </header>

          <div className="max-w-lg">
            <p className="font-display text-[2.6rem] font-bold leading-[1.08] tracking-tight text-white">
              Every lift we install,
              <br />
              in one place.
            </p>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/70">
              Customers, projects, assets and service visits — the working
              record behind the installations.
            </p>

            <div className="mt-10 flex items-center gap-6 border-t border-white/15 pt-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
                EN 81-20
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
                ISO 8100
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
                Addis Ababa
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Compact brand bar for small screens */}
      <div className="relative flex items-center gap-3 overflow-hidden bg-navy-950 px-6 py-6 lg:hidden">
        <Image
          src={lobby}
          alt=""
          placeholder="blur"
          priority
          sizes="100vw"
          className="absolute inset-0 h-full w-full object-cover opacity-45"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-navy-950 via-navy-950/80 to-navy-950/40"
        />
        <div className="relative w-11 shrink-0 overflow-hidden rounded-lg bg-white p-1">
          <Image src={logo} alt="" priority className="h-auto w-full" />
        </div>
        <div className="relative">
          <p className="font-display text-sm font-bold leading-tight text-white">
            Shining Star
          </p>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gold-400">
            Electromechanical
          </p>
        </div>
      </div>

      {/* Right: sign in */}
      <section className="flex items-center justify-center bg-[#faf8f5] px-6 py-14 sm:px-10 lg:px-16">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl font-bold tracking-tight text-navy-950">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-navy-600">
            Use the workspace name your company was set up with.
          </p>

          <form
            onSubmit={(event) => void onSubmit(event)}
            className="mt-9 space-y-5"
          >
            <div>
              <label className={label} htmlFor="workspace">
                Workspace
              </label>
              <input
                id="workspace"
                className={field}
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                placeholder="your-company"
                autoComplete="organization"
                required
              />
            </div>

            <div>
              <label className={label} htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className={field}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className={label} htmlFor="password">
                Password
              </label>
              <input
                id="password"
                className={field}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                autoComplete="current-password"
                minLength={8}
                required
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-gold-500 py-3.5 text-sm font-semibold tracking-wide text-navy-950 outline-none transition hover:bg-gold-400 active:bg-gold-600 focus-visible:ring-4 focus-visible:ring-gold-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {IS_DEV && (
            <div className="mt-10 border-t border-navy-100 pt-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-navy-600">
                Demo workspace
              </p>
              <p className="mt-1.5 font-mono text-xs leading-relaxed text-navy-600/80">
                demo · ceo@demo.example.com · Demo!Passw0rd
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
