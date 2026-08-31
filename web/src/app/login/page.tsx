'use client';

import { Eye, EyeOff, Lock, Mail, Building2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

import { btnPrimary } from '@/components/form-styles';
import { ApiError, login } from '@/lib/api';

import logo from '../../../public/shining-star-logo.jpg';

// Demo credentials are a dev convenience only; production builds ship an
// empty form and no hint. NODE_ENV is inlined at build time.
const IS_DEV = process.env.NODE_ENV !== 'production';

export default function LoginPage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState(IS_DEV ? 'demo' : '');
  const [email, setEmail] = useState(IS_DEV ? 'ceo@demo.example.com' : '');
  const [password, setPassword] = useState(IS_DEV ? 'Demo!Passw0rd' : '');
  const [showPassword, setShowPassword] = useState(false);
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

  const label = 'mb-1.5 block text-xs font-semibold text-slate-600';
  const field =
    'w-full rounded-xl border border-transparent bg-slate-100 py-3 pl-11 text-sm text-slate-900 ' +
    'outline-none transition placeholder:text-slate-400 ' +
    'focus:border-gold-500 focus:bg-white focus:ring-4 focus:ring-gold-500/15';
  const fieldIcon =
    'pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400';

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Left: the brand, and nothing else.
          The mark is a JPEG with a white ground (no alpha), so it sits on a
          plate rather than directly on the dark panel — a knockout would
          need an asset that does not exist. Everything else here is type,
          rule and the brand orange: no photography, no product screenshots,
          no decoration that is not the identity itself. */}
      <aside className="relative hidden flex-col items-center justify-center overflow-hidden bg-navy-950 px-14 py-16 lg:flex">
        {/* One soft orange bloom behind the lockup so the panel has depth
            without another image in it. */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-[58%] rounded-full bg-gold-500/12 blur-[90px]"
        />

        <div className="relative flex flex-col items-center text-center">
          <div className="w-56 overflow-hidden rounded-3xl bg-white p-6 shadow-[0_30px_70px_-25px_rgba(0,0,0,0.8)]">
            <Image src={logo} alt="Shining Star Electromechanical Works" priority className="h-auto w-full" />
          </div>

          <h2 className="font-display mt-10 max-w-sm text-[1.75rem] font-bold leading-tight tracking-tight text-white">
            Shining Star
            <br />
            Electromechanical Works
          </h2>

          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.3em] text-gold-500">
            Star of Elevation
          </p>

          <div aria-hidden className="mt-10 h-px w-16 bg-white/20" />

          <p className="mt-6 max-w-xs text-sm leading-relaxed text-white/50">
            Elevator sales, installation and maintenance — managed end to end.
          </p>
        </div>

        <p className="absolute bottom-10 font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">
          Addis Ababa, Ethiopia
        </p>
      </aside>

      {/* Compact brand bar for small screens */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-5 lg:hidden">
        <div className="w-10 shrink-0 overflow-hidden rounded-lg bg-white p-1 shadow-sm">
          <Image src={logo} alt="" priority className="h-auto w-full" />
        </div>
        <div>
          <p className="font-display text-sm font-bold leading-tight text-slate-900">Shining Star</p>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-gold-600">
            Electromechanical
          </p>
        </div>
      </div>

      {/* Right: sign in */}
      <section className="flex flex-col justify-center bg-white px-6 py-14 sm:px-12 lg:px-20">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="font-display text-[2rem] font-bold tracking-tight text-slate-900">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Sign in to your company’s workspace.
          </p>

          <form onSubmit={(event) => void onSubmit(event)} className="mt-8 space-y-4">
            <div>
              <label className={label} htmlFor="workspace">
                Workspace
              </label>
              <div className="relative">
                <Building2 aria-hidden className={fieldIcon} />
                <input
                  id="workspace"
                  className={`${field} pr-4`}
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value)}
                  placeholder="your-company"
                  autoComplete="organization"
                  required
                />
              </div>
            </div>

            <div>
              <label className={label} htmlFor="email">
                Email
              </label>
              <div className="relative">
                <Mail aria-hidden className={fieldIcon} />
                <input
                  id="email"
                  className={`${field} pr-4`}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div>
              <label className={label} htmlFor="password">
                Password
              </label>
              <div className="relative">
                <Lock aria-hidden className={fieldIcon} />
                <input
                  id="password"
                  className={`${field} pr-11`}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="current-password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((shown) => !shown)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-slate-700"
                >
                  {showPassword ? (
                    <EyeOff aria-hidden className="h-4.5 w-4.5" />
                  ) : (
                    <Eye aria-hidden className="h-4.5 w-4.5" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={`${btnPrimary} w-full rounded-xl py-3.5 text-[15px]`}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* There is no self-service reset: an administrator sets passwords
              (employees screen), so this says the true thing rather than
              linking to a flow that does not exist. */}
          <p className="mt-6 text-center text-xs text-slate-500">
            Forgotten your password? Ask your system administrator to reset it.
          </p>

          {IS_DEV && (
            <div className="mt-8 rounded-xl bg-slate-50 px-4 py-3">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Demo workspace
              </p>
              <p className="mt-1 font-mono text-xs leading-relaxed text-slate-500">
                demo · ceo@demo.example.com · Demo!Passw0rd
              </p>
            </div>
          )}
        </div>

        <p className="mt-12 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
          Shining Star Electromechanical Works · Addis Ababa
        </p>
      </section>
    </main>
  );
}
