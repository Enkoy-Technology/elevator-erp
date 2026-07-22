import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { DuplicateMatchSummary } from '../../common/types/duplicate.types';
import { customerFingerprints } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import type { CheckDuplicateCustomerDto } from './dto/check-duplicate-customer.dto';
import type { CreateCustomerDto } from './dto/create-customer.dto';
import {
  applySoundexBonus,
  composeDuplicateScore,
  encodeGeohash,
  geoProximityScore,
  normalizeName,
  normalizePhoneE164,
  recommendationForScore,
} from './duplicate-scoring';

interface CandidateRow {
  customer_id: string;
  name: string;
  name_sim: string | number;
  soundex_match: boolean;
  phone_match: boolean;
  building_sim: string | number | null;
  distance_m: string | number | null;
  has_building: boolean;
  has_geo: boolean;
}

export interface DuplicateCheckResult {
  recommendation: ReturnType<typeof recommendationForScore>;
  maxScore: number;
  matches: DuplicateMatchSummary[];
}

@Injectable()
export class DuplicateDetectionService {
  constructor(private readonly tenantDb: TenantDbService) {}

  async check(
    tenantId: string,
    input: CheckDuplicateCustomerDto,
  ): Promise<DuplicateCheckResult> {
    const nameNormalized = normalizeName(input.name);
    const phone = normalizePhoneE164(input.phone);
    const alternatePhone = normalizePhoneE164(input.alternatePhone);
    const buildingNormalized = input.buildingName
      ? normalizeName(input.buildingName)
      : null;
    const hasGeo =
      input.latitude !== undefined && input.longitude !== undefined;
    const geohashPrefix =
      hasGeo && input.latitude !== undefined && input.longitude !== undefined
        ? encodeGeohash(input.latitude, input.longitude, 5)
        : null;

    const rows = await this.tenantDb.withTenant(tenantId, async (tx) => {
      const result = await tx.execute(sql`
        select
          c.id as customer_id,
          c.name,
          similarity(f.name_normalized, ${nameNormalized}) as name_sim,
          (f.name_soundex = soundex(${nameNormalized})) as soundex_match,
          (
            (${phone}::text is not null and (
              f.phone_e164 = ${phone} or f.alternate_phone_e164 = ${phone}
            ))
            or (${alternatePhone}::text is not null and (
              f.phone_e164 = ${alternatePhone}
              or f.alternate_phone_e164 = ${alternatePhone}
            ))
          ) as phone_match,
          case
            when ${buildingNormalized}::text is not null
              and f.building_normalized is not null
            then similarity(f.building_normalized, ${buildingNormalized})
            else null
          end as building_sim,
          case
            when ${hasGeo}::boolean
              and c.latitude is not null
              and c.longitude is not null
            then (
              6371000 * 2 * asin(sqrt(
                power(sin(radians((c.latitude::float8 - ${input.latitude ?? 0}) / 2)), 2)
                + cos(radians(${input.latitude ?? 0}))
                  * cos(radians(c.latitude::float8))
                  * power(sin(radians((c.longitude::float8 - ${input.longitude ?? 0}) / 2)), 2)
              ))
            )
            else null
          end as distance_m,
          (f.building_normalized is not null and ${buildingNormalized}::text is not null) as has_building,
          (${hasGeo}::boolean and c.latitude is not null and c.longitude is not null) as has_geo
        from customer_fingerprints f
        inner join customers c
          on c.tenant_id = f.tenant_id and c.id = f.customer_id
        where c.deleted_at is null
          and (
            similarity(f.name_normalized, ${nameNormalized}) > 0.25
            or (
              ${phone}::text is not null
              and (f.phone_e164 = ${phone} or f.alternate_phone_e164 = ${phone})
            )
            or (
              ${alternatePhone}::text is not null
              and (
                f.phone_e164 = ${alternatePhone}
                or f.alternate_phone_e164 = ${alternatePhone}
              )
            )
            or (
              ${buildingNormalized}::text is not null
              and f.building_normalized is not null
              and similarity(f.building_normalized, ${buildingNormalized}) > 0.3
            )
            or (
              ${geohashPrefix}::text is not null
              and f.geohash is not null
              and left(f.geohash, 5) = ${geohashPrefix}
            )
          )
        order by name_sim desc
        limit 25
      `);
      return result as unknown as CandidateRow[];
    });

    const matches: DuplicateMatchSummary[] = [];
    for (const row of rows) {
      const nameSim = Number(row.name_sim);
      const signals: Parameters<typeof composeDuplicateScore>[0] = {
        name: applySoundexBonus(nameSim, Boolean(row.soundex_match)),
      };
      if (phone || alternatePhone) {
        signals.phone = row.phone_match ? 1 : 0;
      }
      if (row.has_geo && row.distance_m !== null) {
        signals.geo = geoProximityScore(Number(row.distance_m));
      }
      if (row.has_building && row.building_sim !== null) {
        signals.building = Number(row.building_sim);
      }
      const score = composeDuplicateScore(signals);
      if (score < 0.4) {
        continue;
      }
      matches.push({
        customerId: row.customer_id,
        name: row.name,
        score,
        recommendation: recommendationForScore(score),
      });
    }

    matches.sort((a, b) => b.score - a.score);
    const maxScore = matches[0]?.score ?? 0;
    return {
      maxScore,
      recommendation: recommendationForScore(maxScore),
      matches: matches.slice(0, 10),
    };
  }

  async upsertFingerprint(
    tenantId: string,
    customerId: string,
    dto: Pick<
      CreateCustomerDto,
      'name' | 'phone' | 'alternatePhone' | 'buildingName'
    > & { latitude?: string | null; longitude?: string | null },
  ): Promise<void> {
    const nameNormalized = normalizeName(dto.name);
    const phoneE164 = normalizePhoneE164(dto.phone);
    const alternatePhoneE164 = normalizePhoneE164(dto.alternatePhone);
    const buildingNormalized = dto.buildingName
      ? normalizeName(dto.buildingName)
      : null;
    const lat =
      dto.latitude !== undefined && dto.latitude !== null
        ? Number(dto.latitude)
        : NaN;
    const lng =
      dto.longitude !== undefined && dto.longitude !== null
        ? Number(dto.longitude)
        : NaN;
    const geohash =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? encodeGeohash(lat, lng)
        : null;

    await this.tenantDb.withTenant(tenantId, async (tx) => {
      const soundexResult = await tx.execute(sql`
        select soundex(${nameNormalized}) as soundex
      `);
      const soundexRows = soundexResult as unknown as Array<{ soundex: string }>;
      const nameSoundex = soundexRows[0]?.soundex ?? '0000';

      await tx
        .insert(customerFingerprints)
        .values({
          tenantId,
          customerId,
          nameNormalized,
          nameSoundex,
          phoneE164,
          alternatePhoneE164,
          buildingNormalized,
          geohash,
        })
        .onConflictDoUpdate({
          target: [
            customerFingerprints.tenantId,
            customerFingerprints.customerId,
          ],
          set: {
            nameNormalized,
            nameSoundex,
            phoneE164,
            alternatePhoneE164,
            buildingNormalized,
            geohash,
            updatedAt: new Date(),
          },
        });
    });
  }
}
