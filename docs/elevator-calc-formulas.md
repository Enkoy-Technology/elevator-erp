# Elevator Calculation & Pricing — Mathematical Specification

Source: TAD Section 4. Standards basis: **EN 81-20/50, ISO 8100, ASME A17.1**.
All calculations MUST use arbitrary-precision decimal arithmetic (`decimal.js` /
`big.js`) — never JavaScript `number` — to prevent floating-point errors.

> Two doc inconsistencies to resolve before coding (Section 4 is authoritative):
> 1. `shaft_depth`: Section 4 = `car_depth + wall_clearance_d + 100`; module table = `car_depth + wall_clearance + counterweight_side`. Use Section 4.
> 2. Breakdown SLA: dispatch matrix says EMERGENCY = 30 min response; Section 3.3 text says 60 min. Confirm with product owner.

## 4.1.1 Input Parameters

| Parameter | Symbol | Unit | Constraints |
|---|---|---|---|
| Rated Load | Q | kg | 320 ≤ Q ≤ 5000 |
| Passenger Capacity | P | persons | P = Q / 75 (rounded) |
| Number of Stops | N | count | 2 ≤ N ≤ 64 |
| Travel Height | H | m | 3 ≤ H ≤ 200 |
| Rated Speed | v | m/s | 0.4 ≤ v ≤ 10.0 |
| Machine Room Type | MR/MRL | enum | MR = Machine Room, MRL = Machine Room Less |
| Door Type | D | enum | CENTER_OPEN, TELESCOPIC, SWING |
| Door Width | Wd | mm | 700 ≤ Wd ≤ 1400 |
| Building Usage | U | enum | RESIDENTIAL, COMMERCIAL, HOSPITAL, INDUSTRIAL |

Also: `marginPercent` 0–100, `taxPercent` 0–50.

## 4.1.2 Car Internal Dimensions (EN 81-20)

```text
car_width  = max(1100, floor(0.6 × sqrt(Q) + 200))   [mm]
car_depth  = max(1400, floor(0.8 × sqrt(Q) + 300))   [mm]
car_height = 2300 + (50 if U = HOSPITAL else 0)       [mm]
```

## 4.1.3 Shaft Internal Dimensions

```text
wall_clearance_w = 150 + (50 if v > 2.5 else 0)   [mm]
wall_clearance_d = 200 + (50 if v > 2.5 else 0)   [mm]
shaft_width = car_width + (2 × wall_clearance_w)   [mm]
shaft_depth = car_depth + wall_clearance_d + 100   [mm]
```

## 4.1.4 Pit Depth

```text
base_pit = 1400 + (50 × N)                          [mm]
speed_adjustment = max(0, (v - 1.0) × 200)          [mm]
pit_depth = base_pit + speed_adjustment + (200 if v > 2.5 else 0)   [mm]
```

## 4.1.5 Overhead Clearance

```text
base_overhead = 4200 + (100 × N)                    [mm]
speed_adjustment = max(0, (v - 1.0) × 300)          [mm]
overhead_clearance = base_overhead + speed_adjustment              [mm]
if MRL: overhead_clearance = overhead_clearance - 1500             [mm]
```

## 4.1.6 Counterweight Mass

```text
counterweight_mass = Q × (0.45 - (0.05 if v > 2.5 else 0) + (0.05 if U = INDUSTRIAL else 0))   [kg]
```
- Standard factor 0.45; high-speed (v > 2.5) −0.05; freight (INDUSTRIAL) +0.05.

## 4.1.7 Motor Power

```text
mechanical_efficiency = 0.60 (geared) or 0.75 (gearless, v > 1.75)
efficiency_factor = 1.0 + (0.1 × (v / 2.5))
motor_power_kw = (Q × v × 9.81 × efficiency_factor) / (1000 × mechanical_efficiency)   [kW]
motor_power_kw = max(3.0, motor_power_kw)
```

## 4.1.8 Guide Rail Selection

| Capacity (kg) | Speed (m/s) | Rail Spec |
|---|---|---|
| Q ≤ 630 | v ≤ 1.0 | T75-3/B |
| Q ≤ 1000 | v ≤ 1.6 | T89-1/B |
| Q ≤ 1600 | v ≤ 2.5 | T114-1/B |
| Q ≤ 2500 | v ≤ 2.5 | T127-2/B |
| Q > 2500 | Any | T140-3/B |

## 4.1.9 Machine Room Dimensions (MR only)

```text
if MR:
  machine_room_width  = shaft_width + 600
  machine_room_depth  = max(3000, shaft_depth + 1000)
  machine_room_height = 2500 + (200 if v > 2.5 else 0)
else (MRL): all dimensions = null
```

## 4.2 Pricing — product price list

> **The TAD §4.2 multiplier model is retired.** Its `Q_base` matrix
> (28,000–145,000) was denominated in **USD**; a July 2026 "currency fix"
> relabelled it ETB without converting the numbers, which under-quoted every
> machine by roughly 100×. Pricing now comes from the product owner's price
> list below. Nothing in §4.1 (the EN 81 technical calculations) changed.

### 4.2.1 Price list (ETB, before margin and before VAT)

| Product | Base | Per stop above 10 | Per kg above 630 |
|---|---|---|---|
| `PASSENGER` (incl. hospital lifts) | tiered by stops, below | 80,000 | 1,000 |
| `CAR_PLATFORM_LIFT` | 5,200,000 | — | — |
| `ESCALATOR` | 6,000,000 | — | — |

**Passenger base tiers** — the base steps up with building height:

| Stops (N) | Base |
|---|---|
| 2 – 19 | 7,000,000 |
| 20 – 30 | 8,000,000 |
| 31 and above | 11,000,000 |

```text
LIST_PRICE = base(N)
           + max(0, N - 10) × rate_stop
           + max(0, Q - 630) × rate_kg
```

- The reference machine is **10 stops at 630 kg**. Both adjustments **floor at
  zero**: an under-spec machine still costs the base, it never prices below it.
  (Confirmed with the product owner, 15 Aug 2026 — "does the price go down
  below the reference point?" → "No".)
- **The stop reference stays at 10 in every tier.** A 20-stop lift is
  `8,000,000 + 10 × 80,000 = 8,800,000`, not 8,000,000 flat. The tier boundary
  is where the base jumps, not where the per-stop count restarts. This is the
  literal reading of "same formula, different base" — see the open question at
  the end of this section.
- `CAR_PLATFORM_LIFT` and `ESCALATOR` are **flat** — stops and capacity do not
  move the price. Platform lifts are sold above 3 floors; that is a sales rule,
  not a price break, so the engine does not gate on it.
  *(Confirmed 31 Aug 2026. The product owner's note read "Escalator base
  6,000,000 and others the same formula", which could have meant the stop and
  capacity adjustments apply to the flat products too — a 12-stop 1000 kg
  escalator would then be 6,530,000 rather than 6,000,000. Asked and answered:
  flat means flat.)*
- Hospital lifts price identically to passenger lifts. The distinction is
  carried by `buildingUsage: 'HOSPITAL'`, which still raises car height to
  2350 mm in §4.1.2.
- Speed, door type, machine-room type, building usage and travel height no
  longer affect price at all. Of those, only **speed, machine-room type and
  building usage** still feed the §4.1 technical block. **`travelHeightM`,
  `doorType` and `doorWidthMm` are accepted and validated but currently feed
  nothing** — no §4.1 formula references them, and their pricing terms were
  removed with the multiplier model. They are kept on the DTO because they
  belong on the quotation record and on any future rope/model output.

> **Open with the product owner.** The tier wording was *"Above 20-30 floor
> base 8,000,000 and above starting from 31 and above base 11,000,000"*. Two
> readings, and they differ by 800,000 ETB at 20 stops:
>
> | N | Implemented (reference stays 10) | Alternative (count restarts per tier) |
> |---|---|---|
> | 19 | 7,720,000 | 7,720,000 |
> | 20 | **8,800,000** | 8,000,000 |
> | 30 | 9,600,000 | 8,800,000 |
> | 31 | **12,680,000** | 11,000,000 |
>
> Also assumed: the 20–30 band is inclusive of 20 (the phrase says "above 20"
> but names the range 20–30), and the per-kg term applies unchanged in all
> tiers since it describes the car, not the building.

### 4.2.1a Terms in the client proposal that are deliberately NOT implemented

The client's own proposal (*ERP SYSTEM SHINING STAR ELECTROMECHANICAL WORKS*,
20 Jul 2026) states `Total Price` as a ten-term additive list. Four terms are
implemented — Base, Capacity Adjustment, Stops Adjustment, Taxes. Six are not:

| Proposal term | Status |
|---|---|
| Speed Adjustment | Dropped with the multiplier model (14 Aug 2026) |
| Door Type Adjustment | Dropped with the multiplier model |
| MR/MRL Adjustment | Dropped with the multiplier model |
| Installation Cost | Dropped with the price list |
| Transportation Cost | Dropped with the price list |
| Optional Features | Never implemented at any commit |

**Confirmed 31 Aug 2026: these stay out.** The product owner's ETB price list
supersedes the proposal's formula. Installation and transport, when they apply,
are quoted manually rather than derived. Re-opening any of them requires the
product owner to supply a coefficient first — there is no defensible default.

Two things in the proposal that the price list did **not** change, and which the
implementation matches exactly:

- `Additional Stops = (Stops − 10) × ETB 80,000` — carried over verbatim.
- `Capacity Adjustment = ((KG − 630) ÷ 100) × ETB 100,000` — algebraically
  identical to the implemented `(KG − 630) × 1,000` (÷100 then ×100,000 is
  ×1,000, exact at every KG, no intermediate rounding). At Q = 1000 kg both
  give 370,000.00.

The proposal's `Base Price = ETB 5,000,000` is an explicitly labelled *example*
and is superseded by the tiered bases above.

### 4.2.2 Final Pricing

```text
TOTAL_BEFORE_MARGIN  = LIST_PRICE
MARGIN_AMOUNT        = TOTAL_BEFORE_MARGIN × (margin_percent / 100)
SUBTOTAL_WITH_MARGIN = TOTAL_BEFORE_MARGIN + MARGIN_AMOUNT
TAX_AMOUNT           = SUBTOTAL_WITH_MARGIN × (tax_percent / 100)
TOTAL_PRICE          = SUBTOTAL_WITH_MARGIN + TAX_AMOUNT
```

On the quotations path `tax_percent` is ignored: `QuotationsService` resolves
the statutory VAT rate from `RatesService` and recomputes the tax lines itself.

### 4.2.3 Worked Example (unit-test fixture)

Input: `PASSENGER`, Q = 1000 kg, N = 12, margin = 25%, tax = 5%.

```text
BASE_PRICE           = 7,000,000.00
STOPS_ADJUSTMENT     = (12 - 10) × 80,000  =   160,000.00
CAPACITY_ADJUSTMENT  = (1000 - 630) × 1,000 =   370,000.00
TOTAL_BEFORE_MARGIN  = 7,530,000.00
MARGIN_AMOUNT        = 1,882,500.00
SUBTOTAL_WITH_MARGIN = 9,412,500.00
TAX_AMOUNT           =   470,625.00
TOTAL_PRICE          = 9,883,125.00
```

## Non-elevator formulas (referenced by other modules)

**Duplicate detection composite (0–1):** Name similarity (pg_trgm + Soundex, w=0.35, ≥0.80) + Phone match (E.164 exact, w=0.25) + Geo proximity (geohash-5 ≈2.4km + Haversine <100m, w=0.25) + Building name (pg_trgm, w=0.15, ≥0.75). Score >0.75 → REVIEW_BEFORE_CREATE; >0.90 → block as HIGH_CONFIDENCE_DUPLICATE.

**Maintenance next-due:** DAILY +1d, WEEKLY +7d, BIWEEKLY +14d, MONTHLY same-day-next-month, QUARTERLY +3mo, BIANNUAL +6mo, ANNUAL +12mo, CUSTOM +custom_interval_days.

**KPIs:** Active installations `COUNT(*) WHERE status='ACTIVE'`; MRR `SUM(monthly_fee) WHERE status='ACTIVE'`; Overdue `SUM(balance_due) WHERE status='OVERDUE'`; SLA compliance `resolved_within_sla / total_resolved × 100`; Inventory valuation `SUM(qty × cost)`; Crew utilization `billable_hours / available_hours × 100`.
