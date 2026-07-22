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

## 4.2.1 Base Cost

```text
BASE_COST = Q_base × N_factor × v_factor × U_factor × D_factor × MR_MRL_factor
```

```text
Q_base        = lookup from base cost matrix (below)
N_factor      = 1.0 + (N - 2) × 0.08
v_factor      = 1.0 + max(0, (v - 1.0) × 0.15)
U_factor      = 1.00 RESIDENTIAL | 1.15 COMMERCIAL | 1.25 HOSPITAL | 1.20 INDUSTRIAL
D_factor      = 1.00 CENTER_OPEN | 1.12 TELESCOPIC | 0.95 SWING
MR_MRL_factor = 1.00 MR | 0.92 MRL
```

### Base Cost Lookup Matrix (ETB)

| Capacity (kg) | Q_base | Capacity (kg) | Q_base |
|---|---|---|---|
| 320 | 28,000 | 1600 | 58,000 |
| 450 | 32,000 | 2000 | 68,000 |
| 630 | 36,000 | 2500 | 82,000 |
| 800 | 40,000 | 3000 | 95,000 |
| 1000 | 45,000 | 4000 | 120,000 |
| 1150 | 48,000 | 5000 | 145,000 |
| 1350 | 52,000 | | |

## 4.2.2 Component Costs

| Component | Formula |
|---|---|
| STOP_COST | `Q_base × 0.04 × (N - 2)` |
| CAPACITY_MULTIPLIER | `1.0 + ((Q - 1000) / 1000) × 0.05`, clamped to `[0.8, 2.0]` |
| SPEED_PREMIUM | Tiered: +3%/m/s above 1.0, +5%/m/s above 2.5, +8%/m/s above 4.0 |
| DOOR_PREMIUM | TELESCOPIC +8%; CENTER_OPEN > 1000mm: +3% per 100mm over |
| INSTALLATION_COST | `Q_base × 0.15 × (1.0 + (H/50) × 0.02) × [1.2 HOSPITAL \| 1.15 INDUSTRIAL]` |
| FREIGHT_COST | `(shaft_width × shaft_depth × H / 1e9) × 500 + (counterweight_mass / 1000) × 200`, min 800 |

## 4.2.3 Final Pricing

```text
EQUIPMENT_SUBTOTAL   = BASE_COST + STOP_COST + SPEED_PREMIUM + DOOR_PREMIUM
TOTAL_BEFORE_MARGIN  = (EQUIPMENT_SUBTOTAL × CAPACITY_MULTIPLIER) + INSTALLATION_COST + FREIGHT_COST
MARGIN_AMOUNT        = TOTAL_BEFORE_MARGIN × (margin_percent / 100)
SUBTOTAL_WITH_MARGIN = TOTAL_BEFORE_MARGIN + MARGIN_AMOUNT
TAX_AMOUNT           = SUBTOTAL_WITH_MARGIN × (tax_percent / 100)
TOTAL_PRICE          = SUBTOTAL_WITH_MARGIN + TAX_AMOUNT
```

## 4.2.4 Worked Example (unit-test fixture)

Input: Q = 1000 kg, N = 12, H = 45 m, v = 1.6 m/s, MRL, CENTER_OPEN, Wd = 900 mm, COMMERCIAL, margin = 25%, tax = 5%.

```text
Q_base = 45,000
N_factor = 1.0 + 10 × 0.08 = 1.80
v_factor = 1.0 + 0.6 × 0.15 = 1.09
U_factor = 1.15 ; D_factor = 1.00 ; MR_MRL_factor = 0.92
BASE_COST = 45,000 × 1.80 × 1.09 × 1.15 × 1.00 × 0.92 = 93,034.62
STOP_COST = 45,000 × 0.04 × 10 = 18,000.00
CAPACITY_MULTIPLIER = 1.00
SPEED_PREMIUM = 45,000 × 0.03 × 0.6 = 810.00
DOOR_PREMIUM = 0.00
INSTALLATION_COST = 45,000 × 0.15 × 1.018 = 6,885.00
FREIGHT_COST = max(800, 118.80 + 90.00) = 800.00
EQUIPMENT_SUBTOTAL = 111,844.62
TOTAL_BEFORE_MARGIN = 111,844.62 × 1.00 + 6,885.00 + 800.00 = 119,529.62
MARGIN_AMOUNT = 29,882.41
SUBTOTAL_WITH_MARGIN = 149,412.03
TAX_AMOUNT = 7,470.60
TOTAL_PRICE = 156,882.63
```

## Non-elevator formulas (referenced by other modules)

**Duplicate detection composite (0–1):** Name similarity (pg_trgm + Soundex, w=0.35, ≥0.80) + Phone match (E.164 exact, w=0.25) + Geo proximity (geohash-5 ≈2.4km + Haversine <100m, w=0.25) + Building name (pg_trgm, w=0.15, ≥0.75). Score >0.75 → REVIEW_BEFORE_CREATE; >0.90 → block as HIGH_CONFIDENCE_DUPLICATE.

**Maintenance next-due:** DAILY +1d, WEEKLY +7d, BIWEEKLY +14d, MONTHLY same-day-next-month, QUARTERLY +3mo, BIANNUAL +6mo, ANNUAL +12mo, CUSTOM +custom_interval_days.

**KPIs:** Active installations `COUNT(*) WHERE status='ACTIVE'`; MRR `SUM(monthly_fee) WHERE status='ACTIVE'`; Overdue `SUM(balance_due) WHERE status='OVERDUE'`; SLA compliance `resolved_within_sla / total_resolved × 100`; Inventory valuation `SUM(qty × cost)`; Crew utilization `billable_hours / available_hours × 100`.
