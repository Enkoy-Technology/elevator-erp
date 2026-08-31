'use client';

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The one list view in this product. Every module's table is this component
 * with different columns — an ERP earns its keep by having a person learn
 * one list and then already know all fourteen, so this file owning the
 * header, the row rhythm, the sort affordance, the empty state and the
 * pager is the point, not an implementation detail.
 *
 * Headless @tanstack/react-table does the column model and sorting; all
 * markup is ours. Sorting is CLIENT-side over the current page only — the
 * list endpoints paginate server-side and take no sort parameter, so
 * pretending to sort the whole set would silently reorder 20 of 400 rows
 * and call it sorted. Columns are opt-in via `enableSorting` for that
 * reason: turn it on where a page-local reorder is honestly useful.
 */

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  rows: readonly T[];
  /** Stable row identity. Falls back to the row index when absent. */
  getRowId?: (row: T) => string;
  /** Server pagination. Omit entirely for a short, unpaginated list. */
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    /** Supply to offer the rows-per-page control. Omit to hide it. */
    onPageSizeChange?: (pageSize: number) => void;
  };
  /** Shown in place of rows. Say what to do next, not "no data". */
  empty?: ReactNode;
  loading?: boolean;
  /** Row click — makes the whole row a target. Keyboard-reachable. */
  onRowClick?: (row: T) => void;
  /** Announced to screen readers and printed above the table. */
  caption?: string;

  /**
   * Row selection. Requires `getRowId` — without a stable id there is
   * nothing to put in the set, so selection is ignored rather than keyed on
   * a row index that changes the moment the page or the sort does.
   */
  selectable?: boolean;
  /** Controlled: the parent owns the set, so a selection survives paging. */
  selectedIds?: ReadonlySet<string>;
  onSelectionChange?: (ids: ReadonlySet<string>) => void;
  /** Shown in a bar above the table while anything is selected. */
  bulkActions?: ReactNode;
  /** Names a row in its checkbox's accessible label. */
  getRowLabel?: (row: T) => string;
}

/**
 * A tri-state checkbox. `indeterminate` is a DOM property, not an
 * attribute, so React cannot set it from JSX — it needs the ref.
 */
const TriStateCheckbox = ({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      // Stops a click on the box also firing the row's onRowClick.
      onClick={(event) => event.stopPropagation()}
      className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-gold-500"
    />
  );
};

const EMPTY_SELECTION: ReadonlySet<string> = new Set();

/** Right-align money and counts; `meta.align` on any column def sets it. */
type ColumnAlign = 'left' | 'right' | 'center';

const alignClass: Record<ColumnAlign, string> = {
  left: 'text-left',
  right: 'text-right tabular-nums whitespace-nowrap',
  center: 'text-center',
};

const readAlign = (meta: unknown): ColumnAlign => {
  const align = (meta as { align?: ColumnAlign } | undefined)?.align;
  return align ?? 'left';
};

export const DataTable = <T,>({
  columns,
  rows,
  getRowId,
  pagination,
  empty,
  loading = false,
  onRowClick,
  caption,
  selectable = false,
  selectedIds,
  onSelectionChange,
  bulkActions,
  getRowLabel,
}: DataTableProps<T>) => {
  const [sorting, setSorting] = useState<SortingState>([]);

  // Selection is only coherent with stable ids.
  const canSelect = selectable && Boolean(getRowId) && Boolean(onSelectionChange);
  const selected = selectedIds ?? EMPTY_SELECTION;

  const pageIds = canSelect && getRowId ? rows.map((row) => getRowId(row)) : [];
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
  const allOnPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;

  const toggleOne = (id: string): void => {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onSelectionChange?.(next);
  };

  // Select-all covers THIS PAGE only — the table has never seen the other
  // pages' rows, and silently selecting records the user cannot see is how
  // a bulk action hits the wrong thing.
  const togglePage = (): void => {
    const next = new Set(selected);
    if (allOnPageSelected) {
      pageIds.forEach((id) => next.delete(id));
    } else {
      pageIds.forEach((id) => next.add(id));
    }
    onSelectionChange?.(next);
  };

  const table = useReactTable({
    data: rows as T[],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    manualPagination: true,
  });

  const columnCount = table.getAllLeafColumns().length + (canSelect ? 1 : 0);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white print:border-0">
      {canSelect && selected.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-gold-500/10 px-4 py-2.5 print:hidden">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
            {selected.size} selected
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions}
            <button
              type="button"
              onClick={() => onSelectionChange?.(new Set())}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {/* Its own scroll container, so a wide table never scrolls the page. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {caption ? <caption className="sr-only print:not-sr-only print:mb-2 print:text-left print:font-semibold">{caption}</caption> : null}
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-slate-200 bg-slate-50 print:bg-transparent">
                {canSelect ? (
                  <th scope="col" className="w-10 px-4 py-2.5 print:hidden">
                    <TriStateCheckbox
                      checked={allOnPageSelected}
                      indeterminate={selectedOnPage > 0 && !allOnPageSelected}
                      onChange={togglePage}
                      label={
                        allOnPageSelected
                          ? 'Clear selection on this page'
                          : 'Select every row on this page'
                      }
                    />
                  </th>
                ) : null}
                {group.headers.map((header) => {
                  const align = readAlign(header.column.columnDef.meta);
                  const sortable = header.column.getCanSort();
                  const direction = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      // The product's label gesture: mono, uppercase, tracked.
                      className={`whitespace-nowrap px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 ${alignClass[align]}`}
                      aria-sort={
                        !sortable || !direction
                          ? undefined
                          : direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                      }
                    >
                      {header.isPlaceholder ? null : sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={`inline-flex items-center gap-1.5 uppercase tracking-[0.14em] transition hover:text-slate-900 print:hidden ${
                            align === 'right' ? 'flex-row-reverse' : ''
                          }`}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {direction === 'asc' ? (
                            <ArrowUp aria-hidden className="h-3 w-3 text-gold-600" />
                          ) : direction === 'desc' ? (
                            <ArrowDown aria-hidden className="h-3 w-3 text-gold-600" />
                          ) : (
                            <ChevronsUpDown aria-hidden className="h-3 w-3 text-slate-300" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-14 text-center text-sm text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-14 text-center text-sm text-slate-500">
                  {empty ?? 'Nothing to show yet.'}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  // A clickable row is a real control: give it a tab stop and
                  // an Enter handler rather than a mouse-only affordance.
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === 'Enter') {
                            onRowClick(row.original);
                          }
                        }
                      : undefined
                  }
                  className={`border-b border-slate-100 last:border-0 ${
                    onRowClick
                      ? 'cursor-pointer transition hover:bg-slate-50 focus-visible:bg-slate-50'
                      : 'transition hover:bg-slate-50/60'
                  } print:hover:bg-transparent`}
                >
                  {canSelect && getRowId ? (
                    <td className="w-10 px-4 py-3 align-middle print:hidden">
                      <TriStateCheckbox
                        checked={selected.has(getRowId(row.original))}
                        onChange={() => toggleOne(getRowId(row.original))}
                        label={`Select ${getRowLabel?.(row.original) ?? `row ${row.index + 1}`}`}
                      />
                    </td>
                  ) : null}
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={`px-4 py-3 align-middle text-slate-700 ${alignClass[readAlign(cell.column.columnDef.meta)]}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.total > 0 ? <TablePager {...pagination} /> : null}
    </div>
  );
};

/**
 * Server-side pager. Deliberately not @tanstack's pagination model: the API
 * already owns page/pageSize/total/totalPages and returns one page of rows,
 * so the table has nothing to slice.
 */
/** The choices the rows-per-page control offers. 100 is also the server's
 *  hard ceiling (common/pagination.ts), so the UI can never ask for a page
 *  the API will silently clamp. */
export const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100] as const;

const TablePager = ({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: NonNullable<DataTableProps<unknown>['pagination']>) => {
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const lastPage = Math.max(totalPages, 1);

  const step =
    'inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-slate-200 px-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-2.5 print:hidden">
      <div className="flex items-center gap-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-slate-500">
          {from}–{to} of {total}
        </p>
        {onPageSizeChange ? (
          <label className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-slate-500">
            Rows
            <select
              value={pageSize}
              // Changing the size changes which rows page 1 holds, so the
              // old page number is meaningless — go back to the first page
              // rather than landing someone past the new last page.
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 outline-none transition focus:border-gold-500"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <nav aria-label="Pagination" className="flex items-center gap-1.5">
        <button type="button" className={step} disabled={page <= 1} onClick={() => onPageChange(1)} aria-label="First page">
          ‹‹
        </button>
        <button type="button" className={step} disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          ‹
        </button>
        <span className="px-2 font-mono text-[11px] uppercase tracking-[0.1em] text-slate-500">
          {page} / {lastPage}
        </span>
        <button type="button" className={step} disabled={page >= lastPage} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          ›
        </button>
        <button type="button" className={step} disabled={page >= lastPage} onClick={() => onPageChange(lastPage)} aria-label="Last page">
          ››
        </button>
      </nav>
    </div>
  );
};
