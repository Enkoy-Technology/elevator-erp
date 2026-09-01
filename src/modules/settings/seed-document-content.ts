import { sql } from 'drizzle-orm';

import type { Database } from '../../database/database.types';
import {
  componentSpecifications,
  documentBoilerplate,
} from '../../database/schema';

/**
 * Shining Star's real pages 3-6, transcribed from the 8-page proforma they
 * sent, plus the 20-row component/brand table from page 5.
 *
 * Two things on their document are deliberately NOT reproduced here, because
 * copying them would bake a contradiction into every future quote:
 *
 *   - Control system. Their page 3 prose says "Duplex full collective
 *     selective control"; their page 2 spec table says "Simplex". Control
 *     system is per-quote (quotation_lines.controlSystem), so it is omitted
 *     from `machine_control` entirely rather than picking a side.
 *   - Power supply. Their page 3 says "400/230V AC 50HZ 3-phase"; their page
 *     2 says 380V 3-phase / 240V single phase for lighting. Also per-quote
 *     (quotation_lines.powerSupply / lightSupply), so the voltage line is
 *     omitted from `operation_panel`.
 *
 * Bodies are plain text. A line starting with '- ' is a bullet; every other
 * line is a paragraph line.
 */
export interface BoilerplateSeed {
  sectionKey: string;
  title: string;
  body: string;
}

export const DOCUMENT_BOILERPLATE_SEEDS: readonly BoilerplateSeed[] = [
  {
    sectionKey: 'standards',
    title: 'Standards',
    body: [
      'The lift and each lift part shall be certified by third party internationally recognized laboratories according to EN 81-20 and EN 81-50 standards. The bidder shall submit technical quality certificates with the bidding document.',
      '- Electromagnetic compatibility',
      '- Electromagnetic immunity',
      '- Electrical safety',
      '- Electronic equipment for use in power facilities',
    ].join('\n'),
  },
  {
    sectionKey: 'cabin_finishing',
    title: 'Cabin Finishing Materials',
    body: [
      'Floor: Vinyl composition tile / wear resistant rubber.',
      'Wall: Hairline finish stainless steel, 1.5mm thick.',
      'Interior face of doors: Hairline finish stainless steel.',
      'Ceiling: Hairline finish stainless steel panels/diffuser grid, 1.5mm thick.',
      'Handrail: Hairline finish stainless steel, two sides, 1.5mm thick.',
      'Mirror: Silver color, half size on two sides.',
      'Frame: Hairline finish stainless steel, 1.5mm thick.',
      'Exterior face of door: Hairline finish stainless steel.',
    ].join('\n'),
  },
  {
    sectionKey: 'machine_control',
    title: 'Machine & Control System',
    // No control-system line here on purpose — see the file header.
    body: 'Gearless machine with collated steel rope & permanent magnet synchronous motor. Microprocessor based. Electric traction type. Variable Voltage Variable Frequency (VVVF) with encoder.',
  },
  {
    sectionKey: 'special_operation',
    title: 'Special Operation & Facilities',
    body: 'Programming (PLC) language shall be English (US), smoke detectors, alarm buzzer, chime sound, audio indication control, toggle switch, call registered light, inter-phone communication with machine room, overload audio and visual indicators, Lambda 2D infrared curtain door protection device, door nodding, LED lighting with automatic ON/OFF ground floor parking, and emergency fireman service at ground floor.',
  },
  {
    sectionKey: 'operation_panel',
    title: 'Car & Landing Operation Panel',
    // No voltage line here on purpose — see the file header.
    body: 'Car display for position and direction with illuminated digital figures. Digital car position and direction control. Digital landing position & direction indicators on all floors. Vandal proof wait/stop push buttons. Dynamic braking during power failure. Braille tactile buttons for disabled users. Automatic ceiling ventilation fan. Temperature control thermostat.',
  },
  {
    sectionKey: 'rescue_device',
    title: 'Rescue Device',
    body: 'Automatic rescue device/back-up during power failure (lift goes to nearest floor and opens). Electronic short-circuit protection for all power outputs. Voltage regulators for fluctuation. Earth leak detection for traction machine during emergency operation. Conforms to EN 81 regulation.',
  },
  {
    sectionKey: 'shaft_information',
    title: 'Shaft Information',
    body: 'Contractor shall consider appropriate shaft, cabin, cabin door, machine room dimensions and prepare working drawings according to architectural and structural requirements before manufacturing. Existing shaft conditions shall be considered.',
  },
  {
    sectionKey: 'supply_includes',
    title: 'Supply Includes',
    body: 'Manufacturer recommended spare parts for 3 years maintenance, replacement and wear/tear parts, maintenance tools, safety guards, operation manuals, spare part manuals, fully dimensioned mounting and erection drawings, and training for client professionals.',
  },
];

export interface ComponentSeed {
  componentName: string;
  brand: string;
  remark: string;
}

const JOINT_VENTURE = 'Zhejiang (Sino-Japan Joint Venture)';

/**
 * Print order is this array's order. Their own table header put "Germany" in
 * the encoder's Brand column and the part number in Remark; normalised here
 * to brand HEIDENHAIN / remark "Germany, ERN1387" so the Brand column means
 * the same thing on all 20 rows.
 */
export const COMPONENT_SPECIFICATION_SEEDS: readonly ComponentSeed[] = [
  { componentName: 'Traction machine (gearless motor)', brand: 'FUJI', remark: JOINT_VENTURE },
  { componentName: 'Encoder', brand: 'HEIDENHAIN', remark: 'Germany, ERN1387' },
  { componentName: 'Brake device', brand: 'FUJI', remark: JOINT_VENTURE },
  { componentName: 'Microcomputer', brand: 'Monarch', remark: 'Monarch NICE3000' },
  { componentName: 'VVVF Inverter', brand: 'Monarch', remark: 'Monarch NICE3000' },
  { componentName: 'Contactor', brand: 'FUJI', remark: 'Japan' },
  { componentName: 'Relay', brand: 'FUJI', remark: 'Japan' },
  { componentName: 'Light curtain', brand: 'WECO', remark: 'Ningbo WECO Optoelectronic Co., Ltd.' },
  { componentName: 'Landing Door Device', brand: 'FUJI', remark: JOINT_VENTURE },
  { componentName: 'Car Ceiling', brand: 'FUJI', remark: JOINT_VENTURE },
  { componentName: 'Door Machine', brand: 'FUJI', remark: JOINT_VENTURE },
  { componentName: 'Operation Panel & Out Calling Board', brand: 'FUJI JAPAN', remark: JOINT_VENTURE },
  { componentName: 'Sill of the Hall & Car Door', brand: 'FUJI JAPAN', remark: 'High Quality Flinty Cast Iron' },
  { componentName: 'Ventilation in Car', brand: 'FUJI', remark: 'Low Noise Axial-Flow Fan' },
  { componentName: 'Guide Rail of the Car', brand: 'HAOSHEN', remark: 'Zhejiang / HAOSHEN' },
  { componentName: 'Traveling cable', brand: 'CHANGSHUN', remark: 'Shanghai / CHANGSHUN' },
  { componentName: 'Steel Ropes for Traction Machine', brand: 'SAFTY', remark: 'Jiangsu / SAFTY' },
  { componentName: 'Safety gear', brand: 'FUJI', remark: JOINT_VENTURE },
  { componentName: 'Buffer', brand: 'FUJI', remark: JOINT_VENTURE },
  { componentName: 'Overrunning Governor', brand: 'FUJI', remark: JOINT_VENTURE },
];

export interface SeedDocumentContentResult {
  boilerplate: number;
  components: number;
}

/**
 * Idempotent: re-running inserts nothing a second time, and — importantly —
 * never overwrites text the tenant has since edited. Both tables carry a
 * tenant-scoped unique key (section_key / sequence) that ON CONFLICT DO
 * NOTHING keys off, so this is safe in a deploy script that runs every time.
 *
 * Runs on the owner connection (DATABASE_ADMIN_URL, as migrations do) and
 * opts that transaction into the `admin_bypass` RLS policy explicitly, the
 * same way OutboxDispatcherRepository does — both tables are FORCE ROW LEVEL
 * SECURITY, so without it a non-superuser owner inserts zero rows and says
 * nothing about it.
 */
export const seedDocumentContent = async (
  db: Database,
  tenantId: string,
): Promise<SeedDocumentContentResult> =>
  db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.admin_bypass', 'on', true)`);

    const sections = await tx
      .insert(documentBoilerplate)
      .values(
        DOCUMENT_BOILERPLATE_SEEDS.map((seed, index) => ({
          tenantId,
          sectionKey: seed.sectionKey,
          title: seed.title,
          body: seed.body,
          sortOrder: index + 1,
        })),
      )
      .onConflictDoNothing({
        target: [documentBoilerplate.tenantId, documentBoilerplate.sectionKey],
      })
      .returning({ id: documentBoilerplate.id });

    const components = await tx
      .insert(componentSpecifications)
      .values(
        COMPONENT_SPECIFICATION_SEEDS.map((seed, index) => ({
          tenantId,
          sequence: index + 1,
          componentName: seed.componentName,
          brand: seed.brand,
          remark: seed.remark,
        })),
      )
      .onConflictDoNothing({
        target: [componentSpecifications.tenantId, componentSpecifications.sequence],
      })
      .returning({ id: componentSpecifications.id });

    return { boilerplate: sections.length, components: components.length };
  });
