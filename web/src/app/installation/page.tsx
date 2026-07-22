'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { fieldClass, labelClass } from '@/components/form-styles';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  completeProjectPhase,
  getAccessToken,
  listProjectPhases,
  listProjects,
  signOffPhase,
  startProjectPhase,
  updatePhaseChecklistItem,
  type Project,
  type ProjectPhase,
} from '@/lib/api';

const PHASE_LABEL: Record<string, string> = {
  SHAFT_PREPARATION: 'Shaft preparation',
  MECHANICAL_ASSEMBLY: 'Mechanical assembly',
  ELECTRICAL_WIRING: 'Electrical wiring',
  TESTING_COMMISSIONING: 'Testing & commissioning',
  HANDOVER: 'Handover',
};

export default function InstallationPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [phases, setPhases] = useState<ProjectPhase[]>([]);
  const [signOffName, setSignOffName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadProjects = useCallback(async () => {
    const [contract, execution, completed] = await Promise.all([
      listProjects({ status: 'CONTRACT', pageSize: 50 }),
      listProjects({ status: 'EXECUTION', pageSize: 50 }),
      listProjects({ status: 'COMPLETED', pageSize: 50 }),
    ]);
    const merged = [
      ...execution.items,
      ...contract.items,
      ...completed.items,
    ];
    setProjects(merged);
    setProjectId((prev) => prev || merged[0]?.id || '');
  }, []);

  const loadPhases = useCallback(async (id: string) => {
    if (!id) {
      setPhases([]);
      return;
    }
    setPhases(await listProjectPhases(id));
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadProjects();
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load projects',
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [router, loadProjects]);

  useEffect(() => {
    if (!projectId) {
      return;
    }
    void loadPhases(projectId).catch((err: unknown) => {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load phases',
      );
    });
  }, [projectId, loadPhases]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await loadPhases(projectId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-8 py-4">
          <h1 className="font-display text-lg font-semibold">Installation</h1>
          <p className="text-sm text-slate-500">
            Sequential phases with checklists through handover
          </p>
        </header>
        <main className="flex-1 space-y-6 bg-slate-50 p-8">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <label className={labelClass} htmlFor="project">
              Project (CONTRACT / EXECUTION)
            </label>
            <select
              id="project"
              className={`${fieldClass} max-w-xl`}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={loading || projects.length === 0}
            >
              {projects.length === 0 ? (
                <option value="">No contracted projects yet</option>
              ) : (
                projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.status})
                  </option>
                ))
              )}
            </select>
          </section>

          {phases.map((phase) => (
            <section
              key={phase.id}
              className="rounded-2xl border border-slate-200 bg-white p-6"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-semibold">
                    {PHASE_LABEL[phase.phaseKind] ?? phase.phaseKind}
                  </h2>
                  <p className="text-xs font-semibold uppercase tracking-wide text-navy-800">
                    {phase.status}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {phase.status === 'PENDING' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() => startProjectPhase(projectId, phase.id))
                      }
                      className="rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                    >
                      Start
                    </button>
                  ) : null}
                  {phase.status === 'IN_PROGRESS' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          completeProjectPhase(projectId, phase.id),
                        )
                      }
                      className="rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                    >
                      Complete phase
                    </button>
                  ) : null}
                </div>
              </div>

              <ul className="space-y-2">
                {phase.checklistItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={item.completed}
                      disabled={busy || phase.status !== 'IN_PROGRESS'}
                      onChange={(e) =>
                        void run(() =>
                          updatePhaseChecklistItem(
                            projectId,
                            phase.id,
                            item.id,
                            e.target.checked,
                          ),
                        )
                      }
                    />
                    <span
                      className={
                        item.completed
                          ? 'text-slate-400 line-through'
                          : 'text-slate-800'
                      }
                    >
                      {item.label}
                      {item.required ? (
                        <span className="ml-1 text-xs text-amber-700">
                          required
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>

              {phase.phaseKind === 'HANDOVER' &&
              phase.status === 'IN_PROGRESS' ? (
                <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
                  <div className="min-w-[200px] flex-1">
                    <label className={labelClass} htmlFor={`sign-${phase.id}`}>
                      Customer sign-off name
                    </label>
                    <input
                      id={`sign-${phase.id}`}
                      className={fieldClass}
                      value={signOffName}
                      onChange={(e) => setSignOffName(e.target.value)}
                      placeholder="Abebe Kebede"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy || signOffName.trim().length < 2}
                    onClick={() =>
                      void run(() =>
                        signOffPhase(projectId, phase.id, signOffName.trim()),
                      )
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-60"
                  >
                    Save sign-off
                  </button>
                  {phase.signOffName ? (
                    <p className="text-xs text-slate-500">
                      Signed: {phase.signOffName}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
