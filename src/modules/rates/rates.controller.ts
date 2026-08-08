import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { isDateString } from 'class-validator';

import { todayIso } from '../../common/business-time';
import { Roles } from '../../common/decorators';
import { rateKinds, type RateKind } from '../../database/schema';
import { CreateRateVersionDto } from './dto/rates.dto';
import { RatesService } from './rates.service';

// Date-only shape, same contract as CreateRateVersionDto.validFrom — plus
// real calendar validity (isDateString rejects '2026-13-40').
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

@ApiTags('rates')
@ApiBearerAuth('access-token')
@Controller('rates')
export class RatesController {
  constructor(private readonly ratesService: RatesService) {}

  @Get()
  @ApiOperation({ summary: 'Resolve the statutory rate version active on a date' })
  @ApiOkResponse({ description: 'Resolved rate version' })
  get(@Query('kind') kind?: string, @Query('on') on?: string) {
    if (!kind || !(rateKinds as readonly string[]).includes(kind)) {
      throw new BadRequestException(`Invalid rate kind: ${kind}`);
    }
    if (
      on !== undefined &&
      (!DATE_ONLY_RE.test(on) || !isDateString(on, { strict: true }))
    ) {
      throw new BadRequestException(`Invalid date: ${on}`);
    }
    return this.ratesService.resolve(kind as RateKind, on ?? todayIso());
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Open a new rate version, closing the currently open one' })
  create(@Body() dto: CreateRateVersionDto) {
    return this.ratesService.create(dto.kind, dto.validFrom, dto.payload, dto.source);
  }
}
