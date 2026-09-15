'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import {
  ASSET_CATEGORY_LABEL,
  ASSET_STATUS_LABEL,
  ASSET_STATUS_TONE,
} from '@/app/assets/labels';
import {
  CANCELLED,
  INVALID,
  promptForDealValue,
} from '@/app/projects/deal-value';
import { DataTable } from '@/components/data-table';
import { btnGhost, btnSecondary } from '@/components/form-styles';
import { StatusPill } from '@/components/list-toolbar';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  deleteCustomer,
  getAccessToken,
  getCurrentRole,
  getCustomer,
  getCustomerOverview,
  listProductTypes,
  NEXT_PROJECT_STATUSES,
  productName,
  updateProjectStatus,
  type ContractStatus,
  type Customer,
  type CustomerOverview,
  type CustomerOverviewAsset,
  type CustomerOverviewContract,
  type CustomerOverviewInvoice,
  type CustomerOverviewMaintenance,
  type CustomerOverviewPayment,
  type CustomerOverviewProject,
  type CustomerOverviewQuotation,
  type CustomerType,
  type InvoiceStatus,
  type PaymentMethod,
  type ProductTypeRow,
  type ProjectStatus,
  type QuoteStatus,
  type UserRole,
} from '@/lib/api';
import {
  formatEtb,
  formatNumber,
  isPositiveEtb,
  subtractEtb,
} from '@/lib/money';

/**
 * The customer as one screen: who they are, how to reach them, what they owe,
 * and every record hanging off them. Read-only on purpose — each section links
 * out to the module that owns those records rather than editing them here.
 *
 * One request (GET /customers/:id/overview) fills all eight sections, each
 * with a real total plus its newest five, so the count in a heading is the
 * whole truth even though the table under it shows five rows.
 */

type Tone = 'neutral' | 'active' | 'good' | 'warn' | 'danger';

/** Mirrors @Roles('SALES_MANAGER') on the customers PATCH/DELETE routes;
 *  CEO and ADMIN bypass via RolesGuard's SUPER_ROLES. */
const canWriteCustomers = (role: UserRole | null): boolean =>
  role === 'MARKETING_MANAGER' ||
  role === 'SALES_MANAGER' ||
  role === 'SALESPERSON' ||
  role === 'SECRETARY' ||
  role === 'CEO' ||
  role === 'GENERAL_MANAGER' ||
  role === 'ADMIN';

/** Mirrors @Roles on PATCH /projects/:id/status. */
const canAdvanceProjects = (role: UserRole | null): boolean =>
  role === 'SALES_MANAGER' ||
  role === 'SALESPERSON' ||
  role === 'TECHNICAL_MANAGER' ||
  role === 'CEO' ||
  role === 'GENERAL_MANAGER' ||
  role === 'ADMIN';

const CUSTOMER_TYPE_LABEL: Record<CustomerType, string> = {
  RESIDENTIAL: 'Residential',
  COMMERCIAL: 'Commercial',
  GOVERNMENT: 'Government',
};

// The status vocabularies below repeat each owning list page's own map
// (projects, quotations, contracts, invoices, maintenance each keep theirs
// locally). Deliberately copied rather than imported: importing a const out
// of another route's page.tsx drags that whole page into this bundle.
// ISSUED is why one shared map cannot work — 'good' on a proforma, 'warn' on
// an unpaid invoice.
const PROJECT_TONE: Record<ProjectStatus, Tone> = {
  LEAD: 'neutral',
  QUOTATION: 'warn',
  CONTRACT: 'active',
  EXECUTION: 'active',
  COMPLETED: 'good',
  CANCELLED: 'danger',
};

const PROJECT_LABEL: Record<ProjectStatus, string> = {
  LEAD: 'Lead',
  QUOTATION: 'Quotation',
  CONTRACT: 'Contract',
  EXECUTION: 'Execution',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const QUOTE_TONE: Record<QuoteStatus, Tone> = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warn',
  APPROVED: 'good',
  REJECTED: 'danger',
  EXPIRED: 'neutral',
  CONVERTED_TO_PROFORMA: 'active',
};

const QUOTE_LABEL: Record<QuoteStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  CONVERTED_TO_PROFORMA: 'Proforma issued',
};

const CONTRACT_TONE: Record<ContractStatus, Tone> = {
  DRAFT: 'neutral',
  SIGNED: 'active',
  COMPLETED: 'good',
  CANCELLED: 'danger',
};

const INVOICE_TONE: Record<InvoiceStatus, Tone> = {
  ISSUED: 'warn',
  PARTIALLY_PAID: 'active',
  PAID: 'good',
  VOID: 'neutral',
};

const INVOICE_LABEL: Record<InvoiceStatus, string> = {
  ISSUED: 'Issued',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  VOID: 'Void',
};

const MAINTENANCE_TONE: Record<CustomerOverviewMaintenance['status'], Tone> = {
  ACTIVE: 'good',
  PAUSED: 'warn',
  ENDED: 'neutral',
};

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  CBE_BIRR: 'CBE Birr',
  TELEBIRR: 'Telebirr',
  OTHER: 'Other',
};

/** 'MONTHLY' -> 'Monthly', 'PENDING_APPROVAL' -> 'Pending approval'. */
const sentenceCase = (value: string): string =>
  value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');

/** Both `timestamp` (ISO) and `date` ('YYYY-MM-DD') columns land as the day
 *  they name — the same slice every list page in this app uses. */
const day = (value: string | null): string => value?.slice(0, 10) ?? '—';

const dash = (value: string | null): string =>
  value && value.trim().length > 0 ? value : '—';

const Field = ({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  /** tel:/mailto: — makes the value dialable rather than just readable. */
  href?: string;
}) => (
  <div className="min-w-0">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    {value ? (
      href ? (
        <a
          href={href}
          className="mt-0.5 block truncate text-sm font-medium text-slate-900 hover:text-gold-600"
        >
          {value}
        </a>
      ) : (
        <p className="mt-0.5 text-sm text-slate-900">{value}</p>
      )
    ) : (
      <p className="mt-0.5 text-sm text-slate-400">—</p>
    )}
  </div>
);

const Money = ({
  label,
  value,
  sub,
  emphasis = false,
  tone = 'plain',
}: {
  label: string;
  value: string;
  sub: string;
  /** The one figure this card exists for. */
  emphasis?: boolean;
  tone?: 'plain' | 'critical';
}) => (
  <div className="min-w-0">
    <p className="text-xs font-medium text-slate-500">{label}</p>
    <p
      className={`font-display mt-1 whitespace-nowrap font-bold leading-tight tabular-nums ${
        emphasis ? 'text-[1.6rem]' : 'text-lg'
      } ${tone === 'critical' ? 'text-status-critical' : 'text-slate-900'}`}
    >
      {value}
    </p>
    <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
  </div>
);

/**
 * One related-record type. An empty section says so in a sentence instead of
 * rendering a table with nothing under the header — "no invoices" is a fact
 * about the account, not missing data.
 */
const Section = <T,>({
  title,
  total,
  rows,
  columns,
  getRowId,
  viewAllHref,
  action,
  empty,
}: {
  title: string;
  /** Every matching record, not `rows.length`. */
  total: number;
  rows: readonly T[];
  columns: ColumnDef<T, unknown>[];
  getRowId: (row: T) => string;
  /** The module list, filtered to this customer. Omitted where the list API
   *  has no customerId filter to honour. */
  viewAllHref?: string;
  /** A create link for this list, shown whether or not it is empty. */
  action?: ReactNode;
  empty: string;
}) => (
  <section id={title.toLowerCase()} className="scroll-mt-36">
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        {title}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
          {formatNumber(total)}
        </span>
      </h2>
      <span className="flex items-center gap-3">
        {action}
        {viewAllHref && total > 0 ? (
          <Link
            href={viewAllHref}
            className="text-xs font-medium text-gold-600 hover:underline"
          >
            View all →
          </Link>
        ) : null}
      </span>
    </div>
    {total === 0 ? (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-3 text-sm text-slate-500">
        {empty}
      </p>
    ) : (
      <>
        <DataTable
          caption={title}
          columns={columns}
          rows={rows}
          getRowId={getRowId}
        />
        {total > rows.length ? (
          <p className="mt-1.5 text-xs text-slate-500">
            Showing the {formatNumber(rows.length)} most recent of{' '}
            {formatNumber(total)}.
          </p>
        ) : null}
      </>
    )}
  </section>
);

const Shell = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-screen">
    <Sidebar />
    <div className="flex min-w-0 flex-1 flex-col">{children}</div>
  </div>
);

const LoadMessage = ({ message }: { message: string }) => (
  <Shell>
    <div className="p-6 sm:p-8">
      <p className="max-w-2xl rounded-xl border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">
        {message}
      </p>
      <Link href="/customers" className={`${btnSecondary} mt-4`}>
        Back to customers
      </Link>
    </div>
  </Shell>
);

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [overview, setOverview] = useState<CustomerOverview | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductTypeRow[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setRole(getCurrentRole());
    void listProductTypes()
      .then(setProducts)
      .catch(() => undefined);
    let cancelled = false;
    const load = async () => {
      try {
        // Two independent reads — fire them together rather than paying for
        // one round trip after the other.
        const [record, sections] = await Promise.all([
          getCustomer(id),
          getCustomerOverview(id),
        ]);
        if (!cancelled) {
          setCustomer(record);
          setOverview(sections);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Failed to load this customer',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [router, id]);

  if (loading) {
    return (
      <Shell>
        <p className="p-6 text-sm text-slate-500 sm:p-8">Loading…</p>
      </Shell>
    );
  }
  if (error) {
    return <LoadMessage message={error} />;
  }
  if (!customer || !overview) {
    return <LoadMessage message="That customer no longer exists." />;
  }

  // The first project is opened with the customer, so its next step — the
  // site survey, mostly — is taken from here rather than from the pipeline.
  const onAdvance = async (
    project: CustomerOverviewProject,
    next: ProjectStatus,
  ) => {
    const amounts = promptForDealValue(project, next);
    if (amounts === CANCELLED) {
      return;
    }
    if (amounts === INVALID) {
      setActionError(
        'Amount must be a number with up to 2 decimals, e.g. 172345.21',
      );
      return;
    }
    setAdvancingId(project.id);
    setActionError(null);
    try {
      await updateProjectStatus(project.id, next, amounts);
      setOverview(await getCustomerOverview(id));
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Stage update failed',
      );
    } finally {
      setAdvancingId(null);
    }
  };

  const onDelete = async () => {
    if (
      !window.confirm(
        `Delete ${customer.name}? Their projects, invoices and history stay, but the account is removed from the list.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteCustomer(customer.id);
      router.push('/customers');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Could not delete ${customer.name} — they may still have open records.`,
      );
      setBusy(false);
    }
  };

  const canWrite = canWriteCustomers(role);
  const address = [
    customer.addressLine1,
    customer.addressLine2,
    customer.buildingName,
  ]
    .filter((line): line is string => Boolean(line && line.trim()))
    .join(', ');
  const place = [customer.city, customer.region, customer.country]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(', ');

  // Aging-consistent: what the invoices themselves still carry. NOT
  // customer.outstandingBalanceEtb, which nets off unapplied cash and reads
  // too low for anyone holding an advance.
  const outstanding = overview.invoices?.outstandingEtb ?? '0.00';
  const overLimit =
    isPositiveEtb(customer.creditLimitEtb) &&
    isPositiveEtb(subtractEtb(outstanding, customer.creditLimitEtb));

  const projectColumns: ColumnDef<CustomerOverviewProject, unknown>[] = [
    {
      id: 'name',
      header: 'Project',
      cell: ({ row }) => (
        <span className="font-medium text-slate-900">{row.original.name}</span>
      ),
    },
    {
      id: 'stage',
      header: 'Stage',
      cell: ({ row }) => (
        <StatusPill
          label={PROJECT_LABEL[row.original.status]}
          tone={PROJECT_TONE[row.original.status]}
        />
      ),
    },
    {
      id: 'product',
      header: 'Product',
      cell: ({ row }) =>
        row.original.productType
          ? productName(products, row.original.productType)
          : '—',
    },
    { id: 'city', header: 'City', cell: ({ row }) => dash(row.original.city) },
    {
      id: 'value',
      header: 'Contract value',
      meta: { align: 'right' },
      cell: ({ row }) =>
        row.original.contractValueEtb
          ? formatEtb(row.original.contractValueEtb)
          : '—',
    },
    ...(canAdvanceProjects(role)
      ? [
          {
            id: 'actions',
            header: '',
            meta: { align: 'right' },
            cell: ({ row }) => {
              const project = row.original;
              const next = NEXT_PROJECT_STATUSES[project.status];
              if (next.length === 0) {
                return null;
              }
              return (
                <div className="flex flex-wrap items-center justify-end gap-1">
                  {next.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={advancingId === project.id}
                      onClick={() => void onAdvance(project, s)}
                      className={
                        s === 'CANCELLED'
                          ? `${btnGhost} px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700`
                          : `${btnSecondary} px-2.5 py-1 text-xs`
                      }
                    >
                      → {PROJECT_LABEL[s]}
                    </button>
                  ))}
                </div>
              );
            },
          } satisfies ColumnDef<CustomerOverviewProject, unknown>,
        ]
      : []),
  ];

  const quotationColumns: ColumnDef<CustomerOverviewQuotation, unknown>[] = [
    {
      id: 'number',
      header: 'Quote',
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium text-slate-900">
            {row.original.quoteNumber}
          </span>
          {row.original.proformaNumber ? (
            <span className="text-xs text-slate-500">
              {row.original.proformaNumber}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusPill
          label={QUOTE_LABEL[row.original.status]}
          tone={QUOTE_TONE[row.original.status]}
        />
      ),
    },
    {
      id: 'total',
      header: 'Total',
      meta: { align: 'right' },
      cell: ({ row }) => formatEtb(row.original.totalPriceEtb),
    },
    {
      id: 'created',
      header: 'Raised',
      cell: ({ row }) => day(row.original.createdAt),
    },
  ];

  const contractColumns: ColumnDef<CustomerOverviewContract, unknown>[] = [
    {
      id: 'number',
      header: 'Contract',
      cell: ({ row }) => (
        <span className="font-medium text-slate-900">
          {row.original.contractNumber}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusPill
          label={sentenceCase(row.original.status)}
          tone={CONTRACT_TONE[row.original.status]}
        />
      ),
    },
    {
      id: 'value',
      header: 'Value',
      meta: { align: 'right' },
      cell: ({ row }) => formatEtb(row.original.contractValueEtb),
    },
    {
      id: 'signed',
      header: 'Signed',
      cell: ({ row }) => day(row.original.signedAt),
    },
  ];

  const invoiceColumns: ColumnDef<CustomerOverviewInvoice, unknown>[] = [
    {
      id: 'number',
      header: 'Invoice',
      cell: ({ row }) => (
        <span className="font-medium text-slate-900">
          {row.original.invoiceNumber}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusPill
          label={INVOICE_LABEL[row.original.status]}
          tone={INVOICE_TONE[row.original.status]}
        />
      ),
    },
    {
      id: 'total',
      header: 'Total',
      meta: { align: 'right' },
      cell: ({ row }) => formatEtb(row.original.totalEtb),
    },
    { id: 'due', header: 'Due', cell: ({ row }) => day(row.original.dueDate) },
  ];

  const paymentColumns: ColumnDef<CustomerOverviewPayment, unknown>[] = [
    {
      id: 'received',
      header: 'Received',
      cell: ({ row }) => (
        <span className="font-medium text-slate-900">
          {day(row.original.receivedAt)}
        </span>
      ),
    },
    {
      id: 'method',
      header: 'Method',
      cell: ({ row }) => PAYMENT_METHOD_LABEL[row.original.method],
    },
    {
      id: 'amount',
      header: 'Amount',
      meta: { align: 'right' },
      cell: ({ row }) => formatEtb(row.original.amountEtb),
    },
  ];

  const assetColumns: ColumnDef<CustomerOverviewAsset, unknown>[] = [
    {
      id: 'building',
      header: 'Building',
      cell: ({ row }) => (
        <span className="font-medium text-slate-900">
          {dash(row.original.buildingName)}
        </span>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      cell: ({ row }) => ASSET_CATEGORY_LABEL[row.original.category],
    },
    {
      id: 'serial',
      header: 'Serial',
      cell: ({ row }) => dash(row.original.serialNumber),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusPill
          label={ASSET_STATUS_LABEL[row.original.status]}
          tone={ASSET_STATUS_TONE[row.original.status]}
        />
      ),
    },
  ];

  // The overview carries this customer's newest five assets, which is where
  // a maintenance row's asset name comes from — no second request, and an
  // id outside that window falls back to its short form.
  const assetName = (assetId: string): string => {
    const asset = overview.assets?.recent.find((item) => item.id === assetId);
    return (
      asset?.buildingName ??
      asset?.serialNumber ??
      (asset ? ASSET_CATEGORY_LABEL[asset.category] : assetId.slice(0, 8))
    );
  };

  const maintenanceColumns: ColumnDef<CustomerOverviewMaintenance, unknown>[] =
    [
      {
        id: 'asset',
        header: 'Asset',
        cell: ({ row }) => (
          <span className="font-medium text-slate-900">
            {assetName(row.original.assetId)}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusPill
            label={sentenceCase(row.original.status)}
            tone={MAINTENANCE_TONE[row.original.status]}
          />
        ),
      },
      {
        id: 'recurrence',
        header: 'Every',
        cell: ({ row }) => sentenceCase(row.original.recurrence),
      },
      {
        id: 'next',
        header: 'Next visit',
        cell: ({ row }) => day(row.original.nextServiceAt),
      },
    ];

  return (
    <Shell>
      <PageHeader
        eyebrow="Customer"
        title={customer.name}
        description={customer.legalName ?? undefined}
        backHref="/customers"
        backLabel="Customers"
        actions={
          <>
            {canWrite ? (
              <>
                <Link
                  href={`/customers/${customer.id}/edit`}
                  className={btnSecondary}
                >
                  <Pencil aria-hidden className="h-4 w-4" />
                  Edit
                </Link>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDelete()}
                  className={`${btnSecondary} text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700`}
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                  Delete
                </button>
              </>
            ) : null}
          </>
        }
      />

      <main className="flex-1 space-y-6 bg-slate-50 p-4 sm:p-8">
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {/* What this customer has with us, at a glance — each jumps to its list below. */}
        <nav
          aria-label="Related records"
          className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3"
        >
          {[
            ['Projects', overview.projects?.total],
            ['Quotations', overview.quotations?.total],
            ['Contracts', overview.contracts?.total],
            ['Invoices', overview.invoices?.total],
            ['Assets', overview.assets?.total],
            ['Maintenance', overview.maintenance?.total],
          ]
            .filter(
              (entry): entry is [string, number] =>
                typeof entry[1] === 'number',
            )
            .map(([label, total]) => (
              <a
                key={label}
                href={`#${label.toLowerCase()}`}
                className="flex flex-col rounded-md border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-400"
              >
                <span className="font-display text-xl font-semibold tabular-nums text-slate-900">
                  {formatNumber(total)}
                </span>
                <span className="text-xs text-slate-500">{label}</span>
              </a>
            ))}
        </nav>

        <div className="grid gap-4 lg:grid-cols-3">
          <section
            className={`rounded-xl border border-slate-200 bg-white p-5 ${
              overview.invoices && overview.payments
                ? 'lg:col-span-2'
                : 'lg:col-span-3'
            }`}
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <StatusPill label={CUSTOMER_TYPE_LABEL[customer.customerType]} />
              {place ? (
                <span className="text-sm text-slate-500">{place}</span>
              ) : null}
            </div>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Field
                label="Phone"
                value={customer.phone}
                href={customer.phone ? `tel:${customer.phone}` : undefined}
              />
              <Field
                label="Alternate phone"
                value={customer.alternatePhone}
                href={
                  customer.alternatePhone
                    ? `tel:${customer.alternatePhone}`
                    : undefined
                }
              />
              <Field
                label="Email"
                value={customer.email}
                href={customer.email ? `mailto:${customer.email}` : undefined}
              />
              <div className="sm:col-span-2">
                <Field label="Address" value={address || null} />
              </div>
            </div>
          </section>

          {/* The AR panel exists only for roles the API actually sends the
              ledger to — see visibleSections() in the customers module. A
              dispatcher gets no `invoices`/`payments` sections at all, and
              rendering an empty shell for them would imply this customer has
              never been billed. */}
          {overview.invoices && overview.payments ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              {/* The sub-label deliberately does NOT say "across N invoices":
                  outstanding is summed over non-VOID invoices while the count
                  is every invoice, so one voided invoice made the two
                  numbers visibly disagree. */}
              <Money
                label="Outstanding"
                value={formatEtb(outstanding)}
                sub="Invoiced, less what has been allocated against it"
                emphasis
                tone={isPositiveEtb(outstanding) ? 'critical' : 'plain'}
              />
              {overLimit ? (
                <p className="mt-2">
                  <StatusPill label="Over credit limit" tone="danger" />
                </p>
              ) : null}
              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <Money
                  label="Credit limit"
                  value={formatEtb(customer.creditLimitEtb)}
                  sub={`${formatNumber(customer.paymentTermsDays)} day terms`}
                />
                {/* Reversals are a second row holding the exact negation, so
                    they net out of the total but still count as rows —
                    "across N payments" read as double the real number. */}
                <Money
                  label="Received"
                  value={formatEtb(overview.payments.receivedEtb)}
                  sub="Net of reversals"
                />
              </div>
            </section>
          ) : null}
        </div>

        {actionError ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {actionError}
          </p>
        ) : null}

        {overview.projects ? (
          <Section
            title="Projects"
            total={overview.projects.total}
            rows={overview.projects.recent}
            columns={projectColumns}
            getRowId={(row) => row.id}
            viewAllHref={`/projects?customerId=${customer.id}`}
            action={
              canWrite ? (
                <Link
                  href={`/projects/new?customerId=${customer.id}`}
                  className="text-xs font-medium text-gold-600 hover:underline"
                >
                  + New project
                </Link>
              ) : null
            }
            empty="No projects yet. Open the first one with + New project."
          />
        ) : null}

        {/* No View all: GET /quotations and /proformas filter by projectId and
            status only, so a link would land on an unfiltered list. */}
        {overview.quotations ? (
          <Section
            title="Quotations"
            total={overview.quotations.total}
            rows={overview.quotations.recent}
            columns={quotationColumns}
            getRowId={(row) => row.id}
            empty="No quotations yet — nothing has been priced for this customer."
          />
        ) : null}

        {overview.contracts ? (
          <Section
            title="Contracts"
            total={overview.contracts.total}
            rows={overview.contracts.recent}
            columns={contractColumns}
            getRowId={(row) => row.id}
            viewAllHref={`/contracts?customerId=${customer.id}`}
            empty="No contracts — nothing has been signed with this customer."
          />
        ) : null}

        {overview.invoices ? (
          <Section
            title="Invoices"
            total={overview.invoices.total}
            rows={overview.invoices.recent}
            columns={invoiceColumns}
            getRowId={(row) => row.id}
            viewAllHref={`/invoices?customerId=${customer.id}`}
            empty="No invoices — this customer has never been billed."
          />
        ) : null}

        {overview.payments ? (
          <Section
            title="Payments"
            total={overview.payments.total}
            rows={overview.payments.recent}
            columns={paymentColumns}
            getRowId={(row) => row.id}
            viewAllHref={`/invoices?tab=payments&customerId=${customer.id}`}
            empty="No payments — nothing has been received from this customer."
          />
        ) : null}

        {overview.assets ? (
          <Section
            title="Assets"
            total={overview.assets.total}
            rows={overview.assets.recent}
            columns={assetColumns}
            getRowId={(row) => row.id}
            viewAllHref={`/assets?customerId=${customer.id}`}
            empty="No assets — no equipment is registered against this customer."
          />
        ) : null}

        {overview.maintenance ? (
          <Section
            title="Maintenance"
            total={overview.maintenance.total}
            rows={overview.maintenance.recent}
            columns={maintenanceColumns}
            getRowId={(row) => row.id}
            viewAllHref={`/maintenance?customerId=${customer.id}`}
            empty="No maintenance contracts — none of their equipment is on a service plan."
          />
        ) : null}
      </main>
    </Shell>
  );
}
