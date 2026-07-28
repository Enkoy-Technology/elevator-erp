import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../../common/decorators';
import { CalculateSpecsDto } from './dto/calculate-specs.dto';
import { ElevatorCalcService } from './elevator-calc.service';
import type { CalcResult } from './types';

@ApiTags('elevator-specs')
@ApiBearerAuth('access-token')
@Controller('elevator-specs')
@Roles('SALES_MANAGER', 'TECHNICAL_LEAD')
export class ElevatorCalcController {
  constructor(private readonly calcService: ElevatorCalcService) {}

  @Post('calculate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Stateless elevator technical + pricing calculation',
    description:
      'Applies EN 81-derived formulas with decimal.js. Does not persist.',
  })
  @ApiOkResponse({ description: 'Technical specs and pricing breakdown' })
  calculate(@Body() dto: CalculateSpecsDto): CalcResult {
    return this.calcService.calculateSpecs(dto);
  }
}
