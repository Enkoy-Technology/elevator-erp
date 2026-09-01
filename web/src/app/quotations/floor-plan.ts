/**
 * The browser's copy of the server's `describeFloorPlan`
 * (src/modules/quotations/quote-spec.ts) — deliberately, so the salesperson
 * watches "B+G+M+10", "13 stops" and "13/13/13" appear as they type the
 * floors instead of finding out what the document says after saving.
 *
 * DISPLAY ONLY. Nothing here is ever sent: the API takes `floorLabels` and
 * derives all of it again, and its answer is the one that gets printed. Keep
 * the two in step — if they ever disagree, the server is right.
 */

const isNumericLabel = (label: string): boolean => /^\d+$/.test(label);

export interface FloorPlan {
  labels: string[];
  /** Fills the calculator's `stops`, which is what pricing already used. */
  stops: number;
  doors: number;
  /** "B+G+M+10" — named floors verbatim, then a COUNT of the numbered ones. */
  displaySummary: string;
  /** "13/13/13" — their floors/stops/doors row. */
  floorsStopsDoors: string;
}

/** "B, G, M, 1, ... 10" -> ['B','G','M','1',...]. Blanks dropped. */
export const parseFloorLabels = (floorLabels: string): string[] =>
  floorLabels
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label.length > 0);

/** `null` for an empty list — a line may legitimately have no floors yet. */
export const describeFloorPlan = (
  floorLabels: string | null | undefined,
  entranceCount?: number | null,
): FloorPlan | null => {
  if (!floorLabels) {
    return null;
  }
  const labels = parseFloorLabels(floorLabels);
  if (labels.length === 0) {
    return null;
  }
  const stops = labels.length;
  const doors = stops * Math.max(1, entranceCount ?? 1);
  const firstNumbered = labels.findIndex(isNumericLabel);
  const displaySummary =
    firstNumbered === -1
      ? labels.join('+')
      : [...labels.slice(0, firstNumbered), String(labels.length - firstNumbered)].join('+');
  return {
    labels,
    stops,
    doors,
    displaySummary,
    floorsStopsDoors: `${stops}/${stops}/${doors}`,
  };
};
