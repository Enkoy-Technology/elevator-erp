import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles } from '../../common/decorators';
import { renderFormula } from '../../common/formula';
import type { AuthenticatedUser } from '../../types/auth.types';
import {
  CreateProductTypeDto,
  UpdateProductTypeDto,
} from './dto/product-type.dto';
import { ProductTypesRepository } from './product-types.repository';

/**
 * The product list behind the calculator and the quotation lines. Anyone who
 * quotes reads it; changing a price is a management act (the requirement
 * document's "pricing approval" sits with the Sales Manager, and the CEO and
 * admin pass everything).
 */
@ApiTags('product-types')
@ApiBearerAuth('access-token')
@Controller('product-types')
@Roles(
  'GENERAL_MANAGER',
  'SALES_MANAGER',
  'SALESPERSON',
  'TECHNICAL_MANAGER',
  'MAINTENANCE_ENGINEER',
  'FINANCE_OFFICER',
  'SECRETARY',
)
export class ProductTypesController {
  constructor(private readonly productTypes: ProductTypesRepository) {}

  @Get()
  @ApiOperation({
    summary:
      'Products and their prices, in display order. Seeds the company list on first use.',
  })
  async list(@CurrentUser() user: AuthenticatedUser) {
    const [rows, { formula: companyFormula }] = await Promise.all([
      this.productTypes.list(user.tenantId),
      this.productTypes.pricingSettings(user.tenantId),
    ]);
    // The formula each row is actually priced with, its own figures written
    // in — so the list reads like the price sheet.
    return rows.map((row) => ({
      ...row,
      effectiveFormula: renderFormula(row.formula ?? companyFormula, {
        perStop: row.perStopEtb,
        perKg: row.perKgEtb,
        refN: row.refStops,
        refC: row.refCapacityKg,
        kgStep: row.kgStep,
      }),
    }));
  }

  @Post()
  @HttpCode(201)
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER')
  @ApiOperation({
    summary: 'Add a product. Its code is derived from the name and then fixed.',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductTypeDto,
  ) {
    return this.productTypes.create(user.tenantId, {
      name: dto.name,
      basePriceEtb: dto.basePriceEtb,
      perStopEtb: dto.perStopEtb ?? '0',
      perKgEtb: dto.perKgEtb ?? '0',
      refStops: dto.refStops ?? 10,
      refCapacityKg: dto.refCapacityKg ?? 630,
      kgStep: dto.kgStep ?? 1,
      minCapacityKg: dto.minCapacityKg ?? null,
      formula: dto.formula?.trim() || null,
      liftGeometry: dto.liftGeometry ?? true,
    });
  }

  @Patch(':id')
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER')
  @ApiOperation({
    summary:
      'Change a product name or its prices. Existing quotations keep the price they were given.',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductTypeDto,
  ) {
    return this.productTypes.update(user.tenantId, id, {
      ...dto,
      ...(dto.formula !== undefined
        ? { formula: dto.formula?.trim() || null }
        : {}),
    });
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('GENERAL_MANAGER', 'SALES_MANAGER')
  @ApiOperation({
    summary: 'Retire a product. Quotations that used it are untouched.',
  })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productTypes.remove(user.tenantId, id);
  }
}
