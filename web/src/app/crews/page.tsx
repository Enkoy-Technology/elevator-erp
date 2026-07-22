'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { fieldClass, labelClass } from '@/components/form-styles';
import { Pagination } from '@/components/pagination';
import { SideDrawer } from '@/components/side-drawer';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  createCrew,
  getAccessToken,
  listCrews,
  type Crew,
  type CrewType,
} from '@/lib/api';

const PAGE_SIZE = 20;

export default function CrewsPage() {
  const router = useRouter();
  const [crews, setCrews] = useState<Crew[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [name, setName] = useState('');
  const [crewType, setCrewType] = useState<CrewType>('INSTALLATION');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listCrews({ page: nextPage, pageSize: PAGE_SIZE });
      setCrews(result.items);
      setPage(result.page);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load crews');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh(page);
  }, [router, refresh, page]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await createCrew({ name, crewType });
      setDrawerOpen(false);
      setName('');
      setPage(1);
      await refresh(1);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Failed to create crew',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-8 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-semibold">Crews</h1>
              <p className="text-sm text-slate-500">
                Field teams for installation and service
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg bg-navy-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-700"
            >
              Create crew
            </button>
          </div>
        </header>
        <main className="flex-1 bg-slate-50 p-8">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : crews.length === 0 ? (
              <p className="text-sm text-slate-500">No crews yet.</p>
            ) : (
              <>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-4 font-semibold">Name</th>
                      <th className="py-2 pr-4 font-semibold">Type</th>
                      <th className="py-2 font-semibold">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crews.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100">
                        <td className="py-3 pr-4 font-medium">{c.name}</td>
                        <td className="py-3 pr-4 text-slate-600">
                          {c.crewType}
                        </td>
                        <td className="py-3 text-slate-600">
                          {c.isActive ? 'Yes' : 'No'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={total}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </>
            )}
          </section>
        </main>
      </div>

      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Create crew"
        footer={
          <button
            type="submit"
            form="create-crew-form"
            disabled={submitting}
            className="w-full rounded-lg bg-navy-800 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? 'Saving…' : 'Save crew'}
          </button>
        }
      >
        <form id="create-crew-form" onSubmit={onCreate} className="space-y-4">
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}
          <div>
            <label className={labelClass} htmlFor="cname">
              Name
            </label>
            <input
              id="cname"
              className={fieldClass}
              required
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ctype">
              Type
            </label>
            <select
              id="ctype"
              className={fieldClass}
              value={crewType}
              onChange={(e) => setCrewType(e.target.value as CrewType)}
            >
              <option value="INSTALLATION">Installation</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="EMERGENCY">Emergency</option>
            </select>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
}
