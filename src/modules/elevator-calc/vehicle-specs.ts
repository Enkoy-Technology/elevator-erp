/**
 * The client's "Detailed Technical Specifications — Escalator, Car Lift,
 * Car Stacking Lift, Car Platform Lift" (2026-10-06), the source of truth
 * for these four products: the speed and door a quotation may carry, and
 * the specification sheet it prints. These are preliminary quotation
 * figures; the document itself says the final ones come from the
 * manufacturer's shop drawing and the vehicle envelope.
 */
export interface VehicleSpec {
  /** Rated speed the document allows, m/s, and the figure a form starts at. */
  speed: { min: number; max: number; standard: number };
  /** Clear door opening width, mm, where the product has a door. */
  door?: { min: number; max: number; standard: number };
  /** Printed on the technical block, in the document's order. */
  sheet: readonly { label: string; value: string }[];
  /** Net platform (car) and clear shaft, mm, where the document gives them. */
  platformMm?: { width: number; depth: number };
  clearShaftMm?: { width: number; depth: number };
  /**
   * The building's opening the salesperson must enter (client, 2026-10-07:
   * every vehicle product takes a shaft width and depth; the escalator a
   * width only) and the least the document allows for it.
   */
  shaftMm: { minWidth: number; minDepth?: number };
  /** False for the escalator: it carries people on steps, not a rated load. */
  ratedLoad: boolean;
}

const SAFETY_LIFT =
  'Door interlocks, safety edge/light curtain, overload protection, overspeed governor, safety gear, buffers, terminal and final limits, emergency stop, alarm, emergency lighting, ARD/emergency recovery where applicable';

export const VEHICLE_SPECS: Readonly<Record<string, VehicleSpec>> = {
  ESCALATOR: {
    speed: { min: 0.5, max: 0.65, standard: 0.5 },
    // The structural opening for a 1000 mm step: 1600–1700 mm.
    shaftMm: { minWidth: 1600 },
    ratedLoad: false,
    sheet: [
      { label: 'Type', value: 'Heavy-duty commercial escalator' },
      { label: 'Inclination', value: '30° standard; 35° where architectural conditions require' },
      { label: 'Step width', value: '1000 mm net step width' },
      { label: 'Rated speed', value: '0.50 m/s standard; 0.65 m/s optional' },
      { label: 'Theoretical capacity', value: 'Approx. 7,300 persons/hour for 1000 mm steps' },
      { label: 'Power supply', value: '380–400 V, 3 phase, 50 Hz' },
      { label: 'Control', value: 'Microprocessor controller with VVVF drive' },
      { label: 'Standard', value: 'EN 115-1 or adopted equivalent' },
      { label: 'Overall width', value: 'Approx. 1500–1600 mm, manufacturer-specific' },
      { label: 'Structural opening width', value: 'Approx. 1600–1700 mm for 1000 mm step width' },
      { label: 'Minimum headroom', value: '2300 mm planning allowance' },
      { label: 'Truss length', value: 'Calculated from floor-to-floor rise and landing geometry' },
      { label: 'Steps', value: 'Aluminium alloy, anti-slip, replaceable' },
      { label: 'Balustrade', value: 'Safety laminated/toughened glass with stainless-steel trim' },
      { label: 'Handrail', value: 'Continuous black rubber handrail' },
      { label: 'Deck / skirt', value: 'Stainless steel' },
      { label: 'Drive', value: 'AC traction drive' },
      {
        label: 'Safety',
        value:
          'Emergency stops, comb switches, handrail inlet protection, overspeed/reverse protection, brake monitoring, step-chain protection, skirt obstruction protection, overload and phase-failure protection',
      },
    ],
  },
  CAR_LIFT: {
    speed: { min: 0.3, max: 0.5, standard: 0.5 },
    door: { min: 2600, max: 2800, standard: 2600 },
    platformMm: { width: 2800, depth: 5600 },
    clearShaftMm: { width: 3400, depth: 6500 },
    shaftMm: { minWidth: 3400, minDepth: 6500 },
    ratedLoad: true,
    sheet: [
      { label: 'Type', value: 'Heavy-duty vehicle/car lift' },
      { label: 'Rated capacity', value: 'Minimum 3,500 kg; 4,000 kg recommended where heavy SUV/pick-up use is expected' },
      { label: 'Rated speed', value: '0.30–0.50 m/s; 0.50 m/s recommended for normal multi-floor service' },
      { label: 'Drive', value: 'Traction or hydraulic; final selection by lift manufacturer' },
      { label: 'Control', value: 'VVVF / PLC / microprocessor' },
      { label: 'Power supply', value: '380–400 V, 3 phase, 50 Hz' },
      { label: 'Typical stops', value: '2–6 stops; project-specific' },
      { label: 'Clear shaft W × D', value: '3400 × 6500 mm preliminary' },
      { label: 'Net usable platform W × D', value: '2800 × 5600 mm preliminary (approx. 15.68 m²)' },
      { label: 'Clear door opening', value: '2600 W × 2300 H mm; 2800 W optional for larger vehicles' },
      { label: 'Door type', value: 'Automatic heavy-duty centre-opening or 4-panel door' },
      { label: 'Pit', value: '1500–1800 mm preliminary; final by manufacturer' },
      { label: 'Overhead', value: '4000–4500 mm preliminary; final by manufacturer' },
      { label: 'Guide rails', value: 'Heavy-duty T-section or approved equivalent' },
      { label: 'Platform frame', value: 'Reinforced structural steel designed for 3,500 kg minimum' },
      { label: 'Platform floor', value: 'Heavy-duty anti-slip steel plate' },
      { label: 'Vehicle clearance', value: 'Final platform and door dimensions must accommodate the actual vehicle width, length, height and loading condition' },
      { label: 'Safety', value: SAFETY_LIFT },
    ],
  },
  CAR_STACKING_LIFT: {
    speed: { min: 0.08, max: 0.15, standard: 0.15 },
    platformMm: { width: 2800, depth: 5500 },
    // No shaft as such: the overall equipment footprint, 3100–3300 × 5600–6000.
    shaftMm: { minWidth: 3100, minDepth: 5600 },
    ratedLoad: true,
    sheet: [
      { label: 'Type', value: 'Two-level independent car parking / stacking lift' },
      { label: 'Rated capacity', value: 'Minimum 3,500 kg per platform; 4,000 kg recommended for heavy SUV/pick-up applications' },
      { label: 'Lifting speed', value: 'Approx. 0.08–0.15 m/s' },
      { label: 'Drive', value: 'Hydraulic or electromechanical' },
      { label: 'Power supply', value: '380–400 V, 3 phase, 50 Hz' },
      { label: 'Control', value: 'PLC / push-button control with safety interlocks' },
      { label: 'Net platform W × D', value: '2800 × 5500 mm preliminary (approx. 15.40 m²)' },
      { label: 'Overall equipment width', value: 'Approx. 3100–3300 mm, subject to column arrangement' },
      { label: 'Overall equipment depth', value: 'Approx. 5600–6000 mm, subject to ramps/clearances' },
      { label: 'Vehicle lifting height', value: 'Typically 1600–2000 mm; must suit vehicle height' },
      { label: 'Platform', value: 'Reinforced steel, anti-slip surface, front/rear wheel stoppers and positioning guides' },
      { label: 'Structure', value: 'Heavy-duty structural steel columns, beams and lifting frame' },
      { label: 'Safety locks', value: 'Mechanical anti-fall locks on each side; platform-lock detection before lifting/parking' },
      { label: 'Hydraulic safety', value: 'Hose/pipe rupture protection and pressure relief where hydraulic' },
      { label: 'Limits', value: 'Upper/lower limit switches and independent final limits' },
      { label: 'Overload', value: 'Electronic/hydraulic overload protection' },
      { label: 'Emergency', value: 'Emergency stop, manual emergency lowering/recovery and power-failure protection' },
    ],
  },
  CAR_PLATFORM_LIFT: {
    speed: { min: 0.15, max: 0.3, standard: 0.3 },
    door: { min: 2400, max: 2800, standard: 2600 },
    platformMm: { width: 2500, depth: 5000 },
    clearShaftMm: { width: 2900, depth: 5500 },
    shaftMm: { minWidth: 2900, minDepth: 5500 },
    ratedLoad: true,
    sheet: [
      { label: 'Type', value: 'Heavy-duty vehicle platform lift' },
      { label: 'Rated capacity', value: 'Minimum 3,500 kg; 4,000 kg recommended' },
      { label: 'Clear shaft W × D', value: '2900 × 5500 mm' },
      { label: 'Net usable platform W × D', value: '2500 × 5000 mm preliminary (approx. 12.50 m²)' },
      { label: 'Rated speed', value: '0.15–0.30 m/s' },
      { label: 'Drive', value: 'Hydraulic or traction, according to final design' },
      { label: 'Power supply', value: '380–400 V, 3 phase, 50 Hz' },
      { label: 'Control', value: 'PLC / VVVF as applicable' },
      { label: 'Door opening', value: '2400–2600 W × 2100–2300 H mm; up to approx. 2800 W × 2300 H where shaft and structure permit' },
      { label: 'Pit', value: '1200–1500 mm preliminary; reduced-pit/pitless design may be possible' },
      { label: 'Overhead', value: '3500–4500 mm preliminary; final by manufacturer' },
      { label: 'Platform', value: 'Heavy-duty reinforced structural steel frame, anti-slip steel plate floor, front and rear wheel stoppers' },
      { label: 'Guide system', value: 'Heavy-duty guide rails and guide shoes/rollers' },
      { label: 'Safety', value: 'Door interlock, safety gear, overspeed protection, emergency stop, overload protection, upper/lower/final limits, rupture valve for hydraulic system, emergency lowering, alarm, emergency lighting and power-failure recovery' },
      { label: 'Civil note', value: '2900 × 5500 mm is the clear shaft allowance; the final usable platform must be checked against guide rails, doors, equipment clearance and vehicle envelope' },
    ],
  },
};

export const isVehicleProduct = (productType: string): boolean =>
  productType in VEHICLE_SPECS;

/** The document's own caveat, printed under every one of these blocks. */
export const VEHICLE_SPEC_NOTE =
  "Preliminary engineering/quotation figures from the company's standard specification; final dimensions, pit, overhead, door, motor and structural loads are taken from the selected manufacturer's approved shop drawing and checked against the largest intended vehicle.";
