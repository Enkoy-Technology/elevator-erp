/** RFC 4180 quoting: wrap every cell, double the quotes inside it. */
export const csvCell = (
  value: string | number | boolean | null | undefined,
): string => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const csvRows = (
  rows: readonly (readonly (string | number | boolean | null)[])[],
): string => rows.map((row) => row.map(csvCell).join(',')).join('\r\n');

/** Hand a client-side CSV to the browser's own download. No dependency needed. */
export const saveCsv = (filename: string, content: string): void => {
  // The BOM is what makes Excel open UTF-8 correctly — Amharic names in a
  // staff list turn to mojibake without it.
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

/** The headers the import parser expects — the sheet the client fills in. */
export const TEMPLATE_HEADERS = ['Full name', 'Email', 'Role', 'Phone'] as const;
