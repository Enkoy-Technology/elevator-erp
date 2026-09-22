'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';

import { btnPrimary, btnSecondary } from '@/components/form-styles';
import { DataTable } from '@/components/data-table';
import { ListToolbar } from '@/components/list-toolbar';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import { formatDate } from '@/lib/datetime';
import {
  ApiError,
  getAccessToken,
  importSiteSurveys,
  listSiteSurveys,
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

export default function SurveysPage() {
  const router = useRouter();
  const [surveys, setSurveys] = useState<SiteSurvey[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const filePicker = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<File | null>(null);
  const [preview, setPreview] = useState<SiteSurveyImportResult | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  const refresh = useCallback(async (nextPage: number, size: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listSiteSurveys({ page: nextPage, pageSize: size });
      setSurveys(result.items);
      setPage(result.page);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load site surveys',
      );
    } finally {
      setLoading(false);
    }
  }, []);

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
      await refresh(1, pageSize);
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

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh(page, pageSize);
  }, [router, refresh, page, pageSize]);

  // The client's own sheet, column for column.
  const columns: ColumnDef<SiteSurvey, unknown>[] = [
    {
      id: 'date',
      header: 'Date',
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
      header: 'Floors',
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
      header: 'Units',
      cell: ({ row }) => dash(row.original.units),
    },
    {
      id: 'surveyedBy',
      header: 'Collected by',
      cell: ({ row }) => dash(row.original.surveyedByName),
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
              <>
                Nothing collected yet. This is where the site collection form
                lands for the manager to read. Fill one in with New site survey,
                or use Import Excel to upload the sheet you already filled on
                site.
              </>
            }
          />
        </main>
      </div>
    </div>
  );
}
