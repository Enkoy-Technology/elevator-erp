'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';

import { btnPrimary } from '@/components/form-styles';
import { DataTable } from '@/components/data-table';
import { ListToolbar } from '@/components/list-toolbar';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import { formatDate } from '@/lib/datetime';
import {
  ApiError,
  getAccessToken,
  listSiteSurveys,
  type SiteSurvey,
} from '@/lib/api';

/** An unfilled cell on the paper sheet reads as a dash, not as a blank. */
const dash = (value: string | number | null): string =>
  value === null || value === '' ? '—' : String(value);

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
          description="The site collection form, filled on site and landing here instead of in a chat app."
        />

        <main className="flex-1 bg-slate-50 p-4 sm:p-8">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <ListToolbar
            actions={
              <button
                type="button"
                onClick={() => router.push('/surveys/new')}
                className={btnPrimary}
              >
                New site survey
              </button>
            }
          />

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
                No site survey collected yet. Fill one on site with New site
                survey — it lands here for the manager to read.
              </>
            }
          />
        </main>
      </div>
    </div>
  );
}
