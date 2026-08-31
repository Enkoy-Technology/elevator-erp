'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChangeEvent, useEffect, useState } from 'react';

import {
  btnPrimary,
  btnSecondary,
  fieldClass,
  labelClass,
} from '@/components/form-styles';
import { StatusPill } from '@/components/list-toolbar';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  getAccessToken,
  importEmployees,
  type EmployeeImportResult,
  type EmployeeImportRow,
} from '@/lib/api';
import { formatNumber } from '@/lib/money';
import { csvRows, saveCsv, TEMPLATE_HEADERS } from '../csv';

const IMPORT_STATUS_TONE: Record<
  EmployeeImportRow['status'],
  'neutral' | 'good' | 'warn' | 'danger'
> = {
  READY: 'neutral',
  CREATED: 'good',
  SKIPPED_DUPLICATE: 'warn',
  ERROR: 'danger',
};

/**
 * Not a create/edit form, so not a `FormPage`: it is a three-step flow —
 * pick a sheet, read the dry run, confirm — whose confirm button has to stay
 * disabled while any row is in error, and whose preview table needs more
 * width than a form column. It borrows FormPage's frame so it still reads as
 * the same product.
 */
export default function ImportEmployeesPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<EmployeeImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept out of `result` so a later dry run can't wipe passwords the admin
  // hasn't written down yet.
  const [issuedPasswords, setIssuedPasswords] = useState<EmployeeImportRow[]>([]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
    }
  }, [router]);

  const runImport = async (sheet: File, commit: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const next = await importEmployees(sheet, commit);
      setResult(next);
      if (!next.dryRun) {
        setIssuedPasswords(
          next.rows.filter((row) => row.temporaryPassword !== undefined),
        );
      }
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : 'Failed to read that file');
    } finally {
      setBusy(false);
    }
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    // Let the same file be picked again after a fix-and-retry.
    event.target.value = '';
    setResult(null);
    setIssuedPasswords([]);
    setFile(picked);
    if (picked) {
      void runImport(picked, false);
    }
  };

  const downloadTemplate = () => {
    saveCsv('employee-import-template.csv', csvRows([TEMPLATE_HEADERS]));
  };

  const countRows = (status: EmployeeImportRow['status']): number =>
    result?.rows.filter((row) => row.status === status).length ?? 0;
  const ready = countRows('READY');
  const skipped = countRows('SKIPPED_DUPLICATE');
  const errors = countRows('ERROR');
  const passwordText = issuedPasswords
    .map((row) => `${row.email ?? ''}\t${row.temporaryPassword ?? ''}`)
    .join('\n');
  const done = issuedPasswords.length > 0;

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-white px-6 py-4 sm:px-8">
          <Link
            href="/employees"
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
            Employees
          </Link>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            People
          </p>
          <h1 className="font-display text-lg font-bold tracking-tight text-slate-900">
            Import employees
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Bring an existing staff list in from a spreadsheet. Nothing is
            written until you confirm.
          </p>
        </header>

        <div className="px-6 py-6 sm:px-8">
          <div className="space-y-4">
            {done ? (
              <>
                <p className="max-w-2xl rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                  Created {formatNumber(issuedPasswords.length)} employee
                  {issuedPasswords.length === 1 ? '' : 's'}.
                </p>
                <div className="max-w-2xl rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  These temporary passwords are shown once and cannot be
                  retrieved again. Copy them now and hand each person their own.
                  Anyone who has them can log in as that employee — tell everyone
                  to change theirs at first login.
                </div>
                <textarea
                  readOnly
                  rows={Math.min(issuedPasswords.length + 1, 12)}
                  className={`${fieldClass} max-w-2xl font-mono text-xs`}
                  aria-label="Temporary passwords"
                  value={passwordText}
                />
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => {
                    void navigator.clipboard?.writeText(passwordText).catch(() => {
                      // Clipboard blocked (insecure origin, denied permission);
                      // the textarea above is selectable, so say nothing.
                    });
                  }}
                >
                  Copy all
                </button>
              </>
            ) : (
              <>
                <div className="max-w-2xl">
                  <label className={labelClass} htmlFor="import-file">
                    Spreadsheet (.xlsx or .csv)
                  </label>
                  <input
                    id="import-file"
                    type="file"
                    accept=".xlsx,.csv"
                    className={fieldClass}
                    onChange={onFileChange}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Columns: {TEMPLATE_HEADERS.join(', ')}.{' '}
                    <button
                      type="button"
                      onClick={downloadTemplate}
                      className="font-medium text-navy-700 underline underline-offset-2"
                    >
                      Download template
                    </button>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Do not put passwords in the sheet — the system generates one
                    per employee and shows it to you once.
                  </p>
                </div>

                {error ? (
                  <p className="max-w-2xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </p>
                ) : null}

                {busy && !result ? (
                  <p className="text-sm text-slate-500">Checking {file?.name}…</p>
                ) : null}

                {result ? (
                  <>
                    <p className="max-w-2xl text-sm text-slate-700">
                      {formatNumber(result.totalRows)} row
                      {result.totalRows === 1 ? '' : 's'} read — {formatNumber(ready)} to create,{' '}
                      {formatNumber(skipped)} already in the system, {formatNumber(errors)} with a
                      problem.
                      {errors > 0
                        ? ' Fix those rows in the sheet and upload it again.'
                        : ''}
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                      <table className="w-full border-collapse text-xs">
                        <caption className="sr-only">Import preview</caption>
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                            <th scope="col" className="px-2 py-1.5 font-medium">Row</th>
                            <th scope="col" className="px-2 py-1.5 font-medium">Name</th>
                            <th scope="col" className="px-2 py-1.5 font-medium">Email</th>
                            <th scope="col" className="px-2 py-1.5 font-medium">Role</th>
                            <th scope="col" className="px-2 py-1.5 font-medium">Status</th>
                            <th scope="col" className="px-2 py-1.5 font-medium">Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.rows.map((row) => (
                            <tr
                              key={row.rowNumber}
                              className="border-b border-slate-100 align-top"
                            >
                              <td className="px-2 py-1.5 tabular-nums text-slate-500">
                                {row.rowNumber}
                              </td>
                              <td className="px-2 py-1.5 text-slate-900">{row.fullName}</td>
                              <td className="px-2 py-1.5 text-slate-600">{row.email}</td>
                              <td className="px-2 py-1.5 text-slate-600">{row.role}</td>
                              <td className="px-2 py-1.5">
                                <StatusPill
                                  label={row.status.replace('_', ' ')}
                                  tone={IMPORT_STATUS_TONE[row.status]}
                                />
                              </td>
                              <td className="px-2 py-1.5 text-slate-500">{row.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
              </>
            )}
          </div>

          <div className="sticky bottom-0 mt-8 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-100/95 py-4 backdrop-blur">
            {done ? (
              <button
                type="button"
                onClick={() => router.push('/employees')}
                className={btnPrimary}
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => file && void runImport(file, true)}
                  disabled={!file || busy || ready === 0 || errors > 0}
                  className={btnPrimary}
                  title={
                    errors > 0
                      ? 'Fix the rows marked ERROR in the sheet and upload it again.'
                      : undefined
                  }
                >
                  {busy
                    ? 'Working…'
                    : `Create ${ready} employee${ready === 1 ? '' : 's'}`}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/employees')}
                  className={btnSecondary}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
