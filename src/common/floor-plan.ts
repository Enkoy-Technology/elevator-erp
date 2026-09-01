/**
 * Floor-plan vocabulary shared by the quotation and proforma document
 * mappers.
 *
 * Lives in /common because BOTH mappers need it and a module may not import
 * from another module. It is document-shaping (how a floor list is printed
 * as "B+G+M+10" and "13/13/13"), not quotation business logic — the pricing
 * inputs it feeds are the caller's concern.
 */
export interface FloorPlan {
  labels: string[];
  floors: number;
  /** What fills the EXISTING `calcInput.stops`. Pricing is unchanged. */
  stops: number;
  doors: number;
  /** "B+G+M+10" — the compressed form they print. */
  displaySummary: string;
  /** "13/13/13" — their floors/stops/doors row. */
  floorsStopsDoors: string;
}

const isNumericLabel = (label: string): boolean => /^\d+$/.test(label);

/** "B, G, M, 1, 2, ... 10" -> ['B','G','M','1',...]. Blanks dropped. */
export const parseFloorLabels = (floorLabels: string): string[] =>
  floorLabels
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label.length > 0);

/**
 * The compressed print form: named floors verbatim, then a COUNT of the
 * numbered ones. ['B','G','M','1'..'10'] -> "B+G+M+10", which is what makes
 * "B+G+M+10" mean 13 floors rather than 4.
 */
const compress = (labels: readonly string[]): string => {
  const firstNumbered = labels.findIndex(isNumericLabel);
  if (firstNumbered === -1) {
    return labels.join('+');
  }
  const named = labels.slice(0, firstNumbered);
  const numbered = labels.length - firstNumbered;
  return [...named, String(numbered)].join('+');
};

/**
 * `null` for an absent or empty label list — a line may legitimately have no
 * floor plan yet (or be an escalator), and an invented zero-stop plan would
 * quietly overwrite the stops the caller did supply.
 *
 * `doors` is stops * entrances: a through-car lift with two entrances has
 * two doors per stop. Their own quote has one entrance, hence 13/13/13.
 */
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
  return {
    labels,
    floors: stops,
    stops,
    doors,
    displaySummary: compress(labels),
    floorsStopsDoors: `${stops}/${stops}/${doors}`,
  };
};

