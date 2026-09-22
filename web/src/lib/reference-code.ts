/**
 * The one value the documents print as `Reference code:` — the salespeople
 * and then the model, exactly as the client writes it on their own offer:
 * `KALKIDAN AND MIKA FUJI-E22`.
 *
 * The two halves are stored apart (`quotations.sales_name` and
 * `quotations.reference_code`) so the editor can ask for the people, and
 * joined here so the PDF, the DOCX and this form cannot drift. Either half
 * may be missing: an old quotation has only the reference code and must keep
 * printing exactly what it printed before.
 *
 * The documents themselves are rendered by the API, which cannot be imported
 * from here; its twin is `documentReferenceCode` in
 * `src/common/export/templates/commercial-document.ts`. Same rule, and it
 * returns null rather than '' so the row can be dropped. Change both.
 */
export const composeReferenceCode = (
  salesName: string | null | undefined,
  referenceCode: string | null | undefined,
): string =>
  [salesName ?? '', referenceCode ?? '']
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join(' ');
