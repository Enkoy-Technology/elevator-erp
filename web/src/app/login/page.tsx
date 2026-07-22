'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

import Image from 'next/image';

import { ApiError, login } from '@/lib/api';
import logo from '../../../public/shining-star-logo.jpg';

export default function LoginPage() {
  const router = useRouter();
  const [tenantSlug, setTenantSlug] = useState('demo');
  const [email, setEmail] = useState('ceo@demo.example.com');
  const [password, setPassword] = useState('Demo!Passw0rd');
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
        err instanceof ApiError ? err.message : 'Could not reach the API',
      );
      setSubmitting(false);
    }
  };

  const field =
    'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm ' +
    'outline-none transition focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20';

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-900 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 w-40 rounded-2xl bg-white p-4">
            <Image
              src={logo}
              alt="Shining Star Electromechanical"
              priority
              className="h-auto w-full"
            />
          </div>
          <p className="mt-1 text-sm text-navy-100/70">
            Sign in to your company workspace
          </p>
        </div>

        <form
          onSubmit={(event) => void onSubmit(event)}
          className="rounded-2xl bg-white p-8 shadow-xl shadow-navy-950/30"
        >
          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Company workspace
            </span>
            <input
              className={field}
              value={tenantSlug}
              onChange={(e) => setTenantSlug(e.target.value)}
              placeholder="your-company"
              autoComplete="organization"
              required
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Email
            </span>
            <input
              className={field}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
          </label>

          <label className="mb-6 block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Password
            </span>
            <input
              className={field}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
              autoComplete="current-password"
              minLength={8}
              required
            />
          </label>

          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-navy-800 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="mt-5 text-center text-xs text-slate-400">
            Demo: <span className="font-mono">demo</span> ·{' '}
            <span className="font-mono">ceo@demo.example.com</span> ·{' '}
            <span className="font-mono">Demo!Passw0rd</span>
          </p>
        </form>
      </div>
    </main>
  );
}
