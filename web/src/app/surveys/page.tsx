'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';

import { Check, Eye, Pencil, Trash2, X } from 'lucide-react';

import { btnPrimary, btnSecondary } from '@/components/form-styles';
import { DataTable } from '@/components/data-table';
import { ListToolbar, RowAction, SearchField } from '@/components/list-toolbar';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import { formatDate } from '@/lib/datetime';
import {
  ApiError,
  deleteSiteSurvey,
  getAccessToken,
  getProfile,
  importSiteSurveys,
  listSiteSurveys,
  type AuthProfile,
  type SiteSurvey,
  type SiteSurveyImportResult,
} from '@/lib/api';

/** An unfilled cell on the paper sheet reads as a dash, not as a blank. */
const dash = (value: string | number | null): string =>
  value === null || value === '' ? '—' : String(value);

/**
 * Rows that will be written. Not `result.imported` — that counts rows actually
 * created, and is 0 on the dry run the preview is built from.
 */
const importable = (result: SiteSurveyImportResult): number =>
  result.totalRows - result.errors.length;

/** 'YYYY-MM-DD' is a plain date: pin it to local midnight so the day never
 *  slips a square west of Addis. */
const surveyDay = (iso: string): string => formatDate(`${iso}T00:00:00`);

/**
 * Who may correct or delete a sheet: a salesperson only their own, everyone
 * else on this screen any of them — the same rule the API enforces. The list
 * is already scoped server-side, so this only keeps the buttons honest; it is
 * not the defence.
 */
const canActOn = (survey: SiteSurvey, me: AuthProfile | null): boolean =>
  me !== null &&
  (me.role !== 'SALESPERSON' || survey.surveyedByUserId === me.userId);

export default function SurveysPage() {
  const router = useRouter();
  const [surveys, setSurveys] = useState<SiteSurvey[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [me, setMe] = useState<AuthProfile | null>(null);
  /** The row whose Delete is armed. Confirm swaps the icons in place. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const filePicker = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<File | null>(null);
  const [preview, setPreview] = useState<SiteSurveyImportResult | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  const refresh = useCallback(
    async (nextPage: number, size: number, q: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await listSiteSurveys({
          search: q || undefined,
          page: nextPage,
          pageSize: size,
        });
        setSurveys(result.items);
        setPage(result.page);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        setConfirmingId(null);
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load site surveys',
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const closeImport = () => {
    setSheet(null);
    setPreview(null);
    setImportError(null);
  };

  /** Never writes on the first pass: the salesperson sees the count first. */
  const runImport = async (file: File, commit: boolean) => {
    setImportBusy(true);
    setImportError(null);
    try {
      const result = await importSiteSurveys(file, commit);
      if (!commit) {
        setPreview(result);
        return;
      }
      closeImport();
      setImported(result.imported);
      // `refresh` writes the page number back from the response, so the list
      // is on page 1 where the new rows are.
      await refresh(1, pageSize, search);
    } catch (err) {
      // A failed commit keeps the preview on screen: the sheet was read fine,
      // and the salesperson needs the button to try again.
      if (!commit) {
        setPreview(null);
      }
      setImportError(
        err instanceof ApiError ? err.message : 'Failed to read that file',
      );
    } finally {
      setImportBusy(false);
    }
  };

  // Only feeds the per-row Edit/Delete buttons; the API decides for real.
  // Once, on mount — who you are does not change when you turn the page.
  useEffect(() => {
    void getProfile()
      .then(setMe)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh(page, pageSize, search);
  }, [router, refresh, page, pageSize, search]);

  const onSearch = (term: string) => {
    setPage(1);
    setSearch(term.trim());
  };

  const onDelete = async (survey: SiteSurvey) => {
    setBusy(true);
    setError(null);
    try {
      await deleteSiteSurvey(survey.id);
      setConfirmingId(null);
      await refresh(page, pageSize, search);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Could not delete the survey for ${survey.projectName}`,
      );
    } finally {
      setBusy(false);
    }
  };

  // The client's own sheet, column for column.
  const columns: ColumnDef<SiteSurvey, unknown>[] = [
    {
      id: 'date',
      // Sorting is client-side over the loaded page (see DataTable), so only
      // the columns where reordering one page actually helps opt in.
      accessorFn: (survey) => survey.surveyDate,
      header: 'Date',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {surveyDay(row.original.surveyDate)}
        </span>
      ),
    },
    {
      accessorKey: 'projectName',
      header: 'Project name',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-medium text-slate-900">
          {row.original.projectName}
        </span>
      ),
    },
    {
      id: 'address',
      header: 'Address',
      cell: ({ row }) => dash(row.original.address),
    },
    {
      id: 'contact',
      header: 'Contact',
      cell: ({ row }) => {
        const { contactName, contactPhone } = row.original;
        if (!contactName && !contactPhone) {
          return '—';
        }
        return (
          <>
            <span className="block">{dash(contactName)}</span>
            {contactPhone ? (
              <span className="mt-0.5 block font-mono text-xs text-slate-500">
                {contactPhone}
              </span>
            ) : null}
          </>
        );
      },
    },
    {
      id: 'shaft',
      header: 'Shaft W × D (cm)',
      cell: ({ row }) => {
        const { shaftWidthCm, shaftDepthCm } = row.original;
        return shaftWidthCm === null && shaftDepthCm === null
          ? '—'
          : `${dash(shaftWidthCm)} × ${dash(shaftDepthCm)}`;
      },
    },
    {
      id: 'floors',
      accessorFn: (survey) => survey.floors ?? '',
      header: 'Floors',
      enableSorting: true,
      cell: ({ row }) => dash(row.original.floors),
    },
    {
      id: 'overhead',
      header: 'OH',
      cell: ({ row }) => dash(row.original.overheadCm),
    },
    {
      id: 'machineRoom',
      header: 'Machine room',
      cell: ({ row }) => dash(row.original.machineRoom),
    },
    {
      id: 'units',
      accessorFn: (survey) => survey.units ?? 0,
      header: 'Units',
      enableSorting: true,
      cell: ({ row }) => dash(row.original.units),
    },
    {
      id: 'surveyedBy',
      accessorFn: (survey) => survey.surveyedByName ?? '',
      header: 'Collected by',
      enableSorting: true,
      cell: ({ row }) => dash(row.original.surveyedByName),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => {
        const survey = row.original;
        const label = survey.projectName;
        return (
          <div className="flex items-center justify-end gap-0.5">
            {confirmingId === survey.id ? (
              <>
                <RowAction
                  icon={Check}
                  tone="danger"
                  disabled={busy}
                  label={`Confirm deleting the survey for ${label}`}
                  onClick={() => void onDelete(survey)}
                />
                <RowAction
                  icon={X}
                  disabled={busy}
                  label={`Keep the survey for ${label}`}
                  onClick={() => setConfirmingId(null)}
                />
              </>
            ) : (
              <>
                <RowAction
                  icon={Eye}
                  label={`View the survey for ${label}`}
                  onClick={() => router.push(`/surveys/${survey.id}`)}
                />
                {canActOn(survey, me) ? (
                  <>
                    <RowAction
                      icon={Pencil}
                      label={`Edit the survey for ${label}`}
                      onClick={() => router.push(`/surveys/${survey.id}/edit`)}
                    />
                    <RowAction
                      icon={Trash2}
                      tone="danger"
                      label={`Delete the survey for ${label}`}
                      onClick={() => setConfirmingId(survey.id)}
                    />
                  </>
                ) : null}
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Sales"
          title="Site surveys"
          description="The site collection form, filled on site or uploaded as the Excel sheet — landing here instead of in a chat app."
        />

        <main className="flex-1 bg-slate-50 p-4 sm:p-8">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <ListToolbar
            search={
              <SearchField
                value={searchInput}
                onChange={setSearchInput}
                onSubmit={onSearch}
                placeholder="Search project, contact, address…"
              />
            }
            actions={
              <>
                <button
                  type="button"
                  onClick={() => router.push('/surveys/new')}
                  className={btnPrimary}
                >
                  New site survey
                </button>
                <button
                  type="button"
                  onClick={() => filePicker.current?.click()}
                  disabled={importBusy}
                  className={btnSecondary}
                >
                  Import Excel
                </button>
              </>
            }
          />

          <input
            ref={filePicker}
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            aria-label="Site collection form to import"
            onChange={(event) => {
              const picked = event.target.files?.[0] ?? null;
              // Let the same file be picked again after a fix-and-retry.
              event.target.value = '';
              setPreview(null);
              setImportError(null);
              setImported(null);
              setSheet(picked);
              if (picked) {
                void runImport(picked, false);
              }
            }}
          />

          {importError ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {importError}
            </p>
          ) : null}

          {imported !== null ? (
            <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              Imported {imported} survey{imported === 1 ? '' : 's'} from the
              sheet.
            </p>
          ) : null}

          {sheet && (preview || importBusy) ? (
            <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-900">{sheet.name}</p>
              {preview ? (
                <>
                  <p className="mt-1 text-sm text-slate-600">
                    {preview.totalRows} row
                    {preview.totalRows === 1 ? '' : 's'} read,{' '}
                    {importable(preview)} will be imported,{' '}
                    {preview.errors.length} skipped.
                  </p>
                  {preview.errors.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm text-red-700">
                      {preview.errors.map((refused) => (
                        <li key={refused.row}>
                          Row {refused.row}: {refused.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => void runImport(sheet, true)}
                      disabled={importBusy || importable(preview) === 0}
                      className={`${btnPrimary} w-full sm:w-auto`}
                    >
                      {importBusy
                        ? 'Importing…'
                        : `Import ${importable(preview)} survey${
                            importable(preview) === 1 ? '' : 's'
                          }`}
                    </button>
                    <button
                      type="button"
                      onClick={closeImport}
                      disabled={importBusy}
                      className={`${btnSecondary} w-full sm:w-auto`}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-slate-500">
                  Reading the sheet…
                </p>
              )}
            </div>
          ) : null}

          <DataTable
            caption="Site surveys"
            columns={columns}
            rows={surveys}
            getRowId={(survey) => survey.id}
            loading={loading}
            pagination={{
              page,
              pageSize,
              total,
              totalPages,
              onPageChange: setPage,
              onPageSizeChange: (size) => {
                setPageSize(size);
                setPage(1);
              },
            }}
            empty={
              search ? (
                <>
                  No site survey matches “{search}”. Clear the search to see
                  them all.
                </>
              ) : (
                <>
                  Nothing collected yet. This is where the site collection form
                  lands for the manager to read. Fill one in with New site
                  survey, or use Import Excel to upload the sheet you already
                  filled on site.
                </>
              )
            }
          />
        </main>
      </div>
    </div>
  );
}
