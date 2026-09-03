import type { ColumnDef } from '@tanstack/react-table';

import { formatDateTime, formatRelative } from '@/lib/datetime';

/**
 * The "Updated" column, defined once so every list reads the same.
 *
 * Lists in this app were a snapshot with no sense of time: you could not tell
 * a record touched an hour ago from one untouched since March. The cell shows
 * how long ago in words, because that is the question people actually ask of
 * a timestamp, and carries the exact value in a tooltip for the rare time
 * the precise moment matters.
 *
 * Give it the row's `updatedAt`. A record with none renders an em dash rather
 * than a wrong date — some list endpoints do not return the column, and
 * inventing `createdAt` in its place would quietly claim something untrue.
 */
export const updatedColumn = <TRow,>(
  getUpdatedAt: (row: TRow) => string | null | undefined,
): ColumnDef<TRow> => ({
  id: 'updatedAt',
  header: 'Updated',
  meta: { align: 'right' },
  cell: ({ row }) => {
    const iso = getUpdatedAt(row.original);
    return (
      <span
        className="whitespace-nowrap text-xs text-slate-500"
        title={formatDateTime(iso)}
      >
        {formatRelative(iso)}
      </span>
    );
  },
});
