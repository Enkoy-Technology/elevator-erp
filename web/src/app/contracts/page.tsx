'use client';

import Link from 'next/link';
import { updatedColumn } from '@/components/updated-column';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import { Ban, ListOrdered, PackageCheck, Pencil } from 'lucide-react';

import { DataTable } from '@/components/data-table';
import { btnGhost, btnPrimary, btnSecondary } from '@/components/form-styles';
import {
  FilterNotice,
  FilterSelect,
  ListToolbar,
  RowAction,
  StatusPill,
} from '@/components/list-toolbar';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import { formatEtb } from '@/lib/money';
import {
  ApiError,
  cancelContract,
  downloadContractDocument,
  downloadContracts,
  getAccessToken,
  getCurrentRole,
  listContracts,
  printContractDocument,
  signContract,
  type ContractExportFormat,
  type ContractListRow,
  type ContractStatus,
  type DocumentFormat,
  type UserRole,
} from '@/lib/api';

const STATUS_LABEL: Record<ContractStatus, string> = {
  DRAFT: 'Draft',
  SIGNED: 'Signed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** One tone vocabulary for the whole ERP — StatusPill owns the colours. */
const STATUS_TONE = {
  DRAFT: 'neutral',
  SIGNED: 'active',
  COMPLETED: 'good',
  CANCELLED: 'danger',
} as const satisfies Record<ContractStatus, string>;

const STATUS_FILTERS: readonly ContractStatus[] = [
  'DRAFT',
  'SIGNED',
  'COMPLETED',
  'CANCELLED',
];

const DOWNLOAD_FORMATS: readonly DocumentFormat[] = ['pdf', 'docx', 'xlsx'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Print stays its own button (it is the action people actually reach for);
 * the three file formats collapse into one control so a row is not seven
 * buttons wide. A native <select> on purpose, same as the quotations list.
 */
const DownloadSelect = ({
  disabled,
  onPick,
  label,
}: {
  disabled: boolean;
  onPick: (format: DocumentFormat) => void;
  label: string;
}) => (
  <select
    aria-label={label}
    disabled={disabled}
    value=""
    onChange={(event) => {
      const format = event.target.value;
      if (format) {
        onPick(format as DocumentFormat);
      }
    }}
    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
  >
    <option value="">Download…</option>
    {DOWNLOAD_FORMATS.map((format) => (
      <option key={format} value={format}>
        {format.toUpperCase()}
      </option>
    ))}
  </select>
);

/**
 * "Export selected" — a CSV of exactly the rows that are ticked, built from
 * the page's already-loaded data. The toolbar's CSV/XLSX buttons export the
 * whole filtered set server-side; this one exports a hand-picked subset,
 * which no endpoint offers.
 *
 * ponytail: duplicated from the other list pages rather than lifted into
 * @/lib/csv, because those files are being edited concurrently. Lift it into
 * one module once they have landed.
 */
const downloadCsv = (
  filename: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): void => {
  // Quote every cell, and neutralise a leading =/+/-/@ so that a crafted
  // value (a customer name, a scope of work) opens as text in a spreadsheet
  // rather than as a formula.
  const cell = (value: string): string =>
    `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
  // BOM: Excel needs it to read UTF-8 (Amharic names) instead of mojibake.
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

/** Mirrors @Roles('SALES_MANAGER') on the contract mutation routes; CEO and
 *  ADMIN bypass via RolesGuard's SUPER_ROLES. TECHNICAL_LEAD and FINANCE
 *  reach the list read-only. */
const canWrite = (role: UserRole | null): boolean =>
  role === 'SALES_MANAGER' || role === 'CEO' || role === 'ADMIN';

export default function ContractsPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);

  const [contracts, setContracts] = useState<ContractListRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [statusFilter, setStatusFilter] = useState<ContractStatus | ''>('');
  /** `?customerId=` — "View all" from a customer's page. `null` until the URL
   *  has been read in an effect; the first load waits for it rather than
   *  fetching the unfiltered set and replacing it a moment later. */
  const [customerFilter, setCustomerFilter] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Cleared whenever the rows underneath it change — an id whose row is no
  // longer loaded cannot be exported, so keeping it would silently drop it.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const refresh = useCallback(
    async (
      nextPage: number,
      status: ContractStatus | '',
      size: number,
      customerId: string,
    ) => {
      setLoading(true);
      setError(null);
      setSelected(new Set());
      try {
        const result = await listContracts({
          status: status || undefined,
          customerId: customerId || undefined,
          page: nextPage,
          pageSize: size,
        });
        setContracts(result.items);
        setPage(result.page);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load contracts');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setCustomerFilter(
      new URLSearchParams(window.location.search).get('customerId') ?? '',
    );
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setRole(getCurrentRole());
    if (customerFilter === null) {
      return;
    }
    void refresh(page, statusFilter, pageSize, customerFilter);
  }, [router, refresh, page, statusFilter, pageSize, customerFilter]);

  const setFilter = (next: ContractStatus | '') => {
    setPage(1);
    setStatusFilter(next);
  };

  const clearCustomerFilter = () => {
    setPage(1);
    setCustomerFilter('');
    router.replace('/contracts', { scroll: false });
  };

  const runAction = async (action: () => Promise<unknown>, id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await refresh(page, statusFilter, pageSize, customerFilter ?? '');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  // ponytail: window.prompt for the optional signature date, matching the
  // established prompt convention on the quotations and invoices lists — the
  // paper is signed on a day that is often not today.
  const onSign = (contract: ContractListRow) => {
    const entered = window.prompt(
      `Sign ${contract.contractNumber}. Signature date (YYYY-MM-DD, blank = today)?`,
      '',
    );
    if (entered === null) {
      return;
    }
    const trimmed = entered.trim();
    if (trimmed && !ISO_DATE.test(trimmed)) {
      setError('Signature date must be in YYYY-MM-DD format');
      return;
    }
    void runAction(() => signContract(contract.id, trimmed || undefined), contract.id);
  };

  const onCancel = (contract: ContractListRow) => {
    const entered = window.prompt(`Reason for cancelling ${contract.contractNumber}?`);
    if (entered === null) {
      return;
    }
    const reason = entered.trim();
    if (reason.length < 2) {
      setError('Cancellation reason must be at least 2 characters');
      return;
    }
    void runAction(() => cancelContract(contract.id, reason), contract.id);
  };

  const onDownload = async (contract: ContractListRow, format: DocumentFormat) => {
    setBusyId(contract.id);
    setError(null);
    try {
      await downloadContractDocument(contract.id, contract.contractNumber, format);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download failed');
    } finally {
      setBusyId(null);
    }
  };

  const onPrint = async (contract: ContractListRow) => {
    setBusyId(contract.id);
    setError(null);
    try {
      await printContractDocument(contract.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed');
    } finally {
      setBusyId(null);
    }
  };

  const onExport = async (format: ContractExportFormat) => {
    setError(null);
    try {
      // Exports the same filtered set the table is showing, customer included.
      await downloadContracts(format, {
        status: statusFilter || undefined,
        customerId: customerFilter || undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Export failed');
    }
  };

  // Money goes out as the raw decimal string, not formatEtb's display form —
  // a spreadsheet has to be able to sum the column.
  const exportSelected = () => {
    const rows = contracts.filter((contract) => selected.has(contract.id));
    downloadCsv(
      'contracts.csv',
      ['Number', 'Project', 'Customer', 'Value ETB', 'Signed', 'Status'],
      rows.map((contract) => [
        contract.contractNumber,
        contract.projectName ?? contract.projectId,
        contract.customerName ?? contract.customerId,
        contract.contractValueEtb,
        contract.signedAt?.slice(0, 10) ?? '',
        STATUS_LABEL[contract.status],
      ]),
    );
  };

  const canMutate = canWrite(role);

  const renderActions = (contract: ContractListRow) => {
    const busy = busyId === contract.id;
    const closed =
      contract.status === 'COMPLETED' || contract.status === 'CANCELLED';
    return (
      <div className="flex items-center justify-end gap-1.5">
        {canMutate && contract.status === 'DRAFT' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSign(contract)}
            className={`${btnPrimary} px-2.5 py-1 text-xs`}
          >
            Sign
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void onPrint(contract)}
          title="Print the PDF"
          className={`${btnSecondary} px-2.5 py-1 text-xs`}
        >
          Print
        </button>
        <DownloadSelect
          disabled={busy}
          onPick={(format) => void onDownload(contract, format)}
          label={`Download ${contract.contractNumber}`}
        />
        <RowAction
          icon={ListOrdered}
          disabled={busy}
          label={`Payment schedule for ${contract.contractNumber}`}
          onClick={() => router.push(`/contracts/${contract.id}/schedule`)}
        />
        {/* Handover is only issuable against a SIGNED contract — the API
            409s on anything else, so the row says so up front. */}
        <RowAction
          icon={PackageCheck}
          disabled={busy || contract.status !== 'SIGNED'}
          label={`Record handover of ${contract.contractNumber}`}
          onClick={() => router.push(`/contracts/${contract.id}/handover`)}
        />
        {canMutate && contract.status === 'DRAFT' ? (
          <RowAction
            icon={Pencil}
            disabled={busy}
            label={`Edit ${contract.contractNumber}`}
            onClick={() => router.push(`/contracts/${contract.id}/edit`)}
          />
        ) : null}
        {/* Destructive action sits last, in the same place on every list. A
            contract is never deleted; its mandatory reason prompt IS the
            confirmation step. */}
        {canMutate && !closed ? (
          <RowAction
            icon={Ban}
            tone="danger"
            disabled={busy}
            label={`Cancel ${contract.contractNumber}`}
            onClick={() => onCancel(contract)}
          />
        ) : null}
      </div>
    );
  };

  const columns: ColumnDef<ContractListRow, unknown>[] = [
    {
      accessorKey: 'contractNumber',
      header: 'Number',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-900">
          {row.original.contractNumber}
        </span>
      ),
    },
    {
      id: 'project',
      header: 'Project',
      accessorFn: (row) => row.projectName ?? row.projectId.slice(0, 8),
      cell: (cell) => cell.getValue<string>(),
    },
    {
      id: 'customer',
      header: 'Customer',
      enableSorting: true,
      accessorFn: (row) => row.customerName ?? row.customerId.slice(0, 8),
      cell: (cell) => cell.getValue<string>(),
    },
    {
      id: 'value',
      header: 'Value',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="font-semibold text-navy-800">
          {formatEtb(row.original.contractValueEtb)}
        </span>
      ),
    },
    {
      id: 'signed',
      header: 'Signed',
      cell: ({ row }) => row.original.signedAt?.slice(0, 10) ?? '—',
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusPill
          label={STATUS_LABEL[row.original.status]}
          tone={STATUS_TONE[row.original.status]}
        />
      ),
    },
    updatedColumn<ContractListRow>((row) => row.updatedAt),
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => renderActions(row.original),
    },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Sales"
          title="Contracts"
          description="Draft → sign → hand over. A contract is issued from an issued proforma and closes the project when it is handed over."
          actions={
            <Link href="/quotations" className={btnGhost}>
              Quotations &amp; proformas
            </Link>
          }
        />

        <main className="flex-1 bg-slate-50 p-8">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <section>
            <ListToolbar
              filters={
                <>
                  <FilterSelect
                    label="Status"
                    value={statusFilter}
                    onChange={setFilter}
                    options={STATUS_FILTERS.map((s) => ({
                      value: s,
                      label: STATUS_LABEL[s],
                    }))}
                    allLabel="All statuses"
                  />
                  {customerFilter ? (
                    <FilterNotice
                      label={
                        contracts.find((c) => c.customerId === customerFilter)
                          ?.customerName ?? 'One customer'
                      }
                      onClear={clearCustomerFilter}
                    />
                  ) : null}
                </>
              }
              actions={(['csv', 'xlsx'] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => void onExport(format)}
                  className={`${btnGhost} px-2.5 py-1.5 text-xs uppercase`}
                >
                  {format}
                </button>
              ))}
            />
            <DataTable
              columns={columns}
              rows={contracts}
              getRowId={(contract) => contract.id}
              getRowLabel={(contract) => contract.contractNumber}
              selectable
              selectedIds={selected}
              onSelectionChange={setSelected}
              bulkActions={
                <button
                  type="button"
                  onClick={exportSelected}
                  className={`${btnSecondary} px-2.5 py-1 text-xs`}
                >
                  Export selected
                </button>
              }
              loading={loading}
              caption="Contracts"
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
                  No contracts yet. Issue one from an{' '}
                  <Link
                    href="/quotations"
                    className="font-semibold text-navy-800 hover:underline"
                  >
                    issued proforma
                  </Link>
                  .
                </>
              }
            />
          </section>
        </main>
      </div>
    </div>
  );
}
