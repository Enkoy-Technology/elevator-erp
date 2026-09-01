import type { UserRole } from '@/lib/api';

/**
 * Shared bits of the two document-content screens (boilerplate prose and the
 * component/brand appendix). Both are the same shape: one short ordered list
 * the whole tenant prints from, edited here instead of pasted per quote.
 */

/**
 * Mirrors `@Roles('SALES_MANAGER')` on the write routes of
 * DocumentContentController; CEO and ADMIN reach them through RolesGuard's
 * SUPER_ROLES. Reading is wider (TECHNICAL_LEAD, FINANCE), so those roles get
 * the list and no buttons rather than a locked page.
 */
export const canEditDocumentContent = (role: UserRole | null): boolean =>
  role === 'SALES_MANAGER' || role === 'CEO' || role === 'ADMIN';

/**
 * The eight section keys the seed ships with. Offered as a `<datalist>` on
 * the create form: the key is not a layout slot the renderer looks up — it
 * prints whatever exists, in sort order — but a tenant who invents
 * `cabinFinishing` next to the seeded `cabin_finishing` ends up with two
 * sections saying the same thing, which is the exact failure these screens
 * exist to stop.
 */
export const BOILERPLATE_SEED_KEYS = [
  'standards',
  'cabin_finishing',
  'machine_control',
  'special_operation',
  'operation_panel',
  'rescue_device',
  'shaft_information',
  'supply_includes',
] as const;

/** What the API's `sectionKey` validator accepts, as an HTML pattern. */
export const SECTION_KEY_PATTERN = '[a-z][a-z0-9_]*';

/**
 * The full id order with `id` moved one place. Returns the WHOLE list because
 * that is what the reorder endpoints demand — a partial list is rejected as a
 * client that reordered a stale view. `null` when the move runs off the end.
 */
export const movedOrder = (
  ids: readonly string[],
  id: string,
  delta: 1 | -1,
): { ids: string[]; index: number } | null => {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) {
    return null;
  }
  const next = [...ids];
  next[from] = ids[to];
  next[to] = ids[from];
  return { ids: next, index: to };
};

/** First non-empty line of a plain-text body, clipped for a table cell. */
export const bodyPreview = (body: string | null): string => {
  const line = (body ?? '')
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  if (!line) {
    return '—';
  }
  return line.length > 96 ? `${line.slice(0, 95)}…` : line;
};
