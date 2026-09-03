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

/**
 * The below-ground and named landings, in the order a building has them.
 * Offered as chips because there is no arithmetic to them — a building
 * either has a mezzanine or it does not.
 */
export const SPECIAL_FLOORS = ['B2', 'B', 'G', 'M'] as const;

/** How high the chip row goes. Beyond this, type the labels by hand. */
export const MAX_UPPER_FLOOR = 30;

/**
 * Selecting an upper floor selects EVERY floor below it too.
 *
 * A lift that stops at the 10th stops at the 9th; picking them one at a time
 * would be ten clicks to describe the ordinary case. So clicking `10` means
 * "up to 10", and clicking an already-selected floor removes just that one —
 * which is how you say "no 13th floor", the case a plain number input cannot
 * express at all.
 */
export const toggleUpperFloor = (
  selected: readonly number[],
  clicked: number,
): number[] => {
  const set = new Set(selected);
  if (set.has(clicked)) {
    set.delete(clicked);
  } else {
    // Fill upward from 1, keeping any gaps the user deliberately made above
    // the one they clicked.
    for (let floor = 1; floor <= clicked; floor += 1) {
      set.add(floor);
    }
  }
  return [...set].sort((a, b) => a - b);
};

/** Chip selections -> the stored `floorLabels` string, bottom to top. */
export const composeFloorLabels = (
  specials: readonly string[],
  upper: readonly number[],
): string => {
  const ordered = SPECIAL_FLOORS.filter((floor) => specials.includes(floor));
  return [...ordered, ...[...upper].sort((a, b) => a - b).map(String)].join(',');
};

/**
 * The stored string -> chip selections, so reopening a saved line shows the
 * chips already lit rather than an empty picker beside a full text box.
 *
 * Anything the chips cannot express — a label like "LG" or a floor above
 * MAX_UPPER_FLOOR — comes back in `custom`, and the caller falls back to the
 * text field rather than silently dropping it.
 */
export const decomposeFloorLabels = (
  floorLabels: string | null | undefined,
): { specials: string[]; upper: number[]; custom: string[] } => {
  const labels = floorLabels ? parseFloorLabels(floorLabels) : [];
  const specials: string[] = [];
  const upper: number[] = [];
  const custom: string[] = [];
  for (const label of labels) {
    if ((SPECIAL_FLOORS as readonly string[]).includes(label)) {
      specials.push(label);
    } else if (isNumericLabel(label) && Number(label) >= 1 && Number(label) <= MAX_UPPER_FLOOR) {
      upper.push(Number(label));
    } else {
      custom.push(label);
    }
  }
  return { specials, upper: upper.sort((a, b) => a - b), custom };
};
