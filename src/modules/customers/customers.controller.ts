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
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser, Roles } from '../../common/decorators';
import { todayIso } from '../../common/business-time';
import { parseExportFormat } from '../../common/export/export-query.dto';
import { type ColumnDef, writeCsv, writeXlsx } from '../../common/export/tabular';
import type { AuthenticatedUser } from '../../types/auth.types';
import { CustomersService } from './customers.service';
import { CheckDuplicateCustomerDto } from './dto/check-duplicate-customer.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

export const CUSTOMERS_EXPORT_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
  { key: 'legalName', header: 'Legal Name' },
  { key: 'email', header: 'Email' },
  { key: 'phone', header: 'Phone' },
  { key: 'alternatePhone', header: 'Alternate Phone' },
  { key: 'addressLine1', header: 'Address Line 1' },
  { key: 'addressLine2', header: 'Address Line 2' },
  { key: 'city', header: 'City' },
  { key: 'region', header: 'Region' },
  { key: 'country', header: 'Country' },
  { key: 'buildingName', header: 'Building Name' },
  { key: 'customerType', header: 'Customer Type' },
  { key: 'creditLimitEtb', header: 'Credit Limit (ETB)', format: 'money' },
  {
    key: 'outstandingBalanceEtb',
    header: 'Outstanding Balance (ETB)',
    format: 'money',
  },
  { key: 'paymentTermsDays', header: 'Payment Terms (Days)' },
  { key: 'tags', header: 'Tags' },
  { key: 'notes', header: 'Notes' },
  { key: 'createdAt', header: 'Created At', format: 'date' },
  { key: 'updatedAt', header: 'Updated At', format: 'date' },
];

@ApiTags('customers')
@ApiBearerAuth('access-token')
@Controller('customers')
// Class-level @Roles is the read gate; per-route @Roles below narrows writes.
// CEO and ADMIN bypass both (RolesGuard SUPER_ROLES).
@Roles('SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE', 'DISPATCHER')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({
    summary:
      'List customers (search + pagination), or stream a CSV/XLSX export with ?format=',
  })
  @ApiOkResponse({ description: 'Paginated customer list' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: false }) res: Response,
    @Query('q') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('format') formatRaw?: string,
  ): Promise<void> {
    const format = parseExportFormat(formatRaw);
    if (!format) {
      const result = await this.customersService.list(user, {
        search,
        page,
        pageSize,
      });
      res.json(result);
      return;
    }
    const rows = this.customersService.streamAll(user, { search });
    const filename = `customers-${todayIso()}`;
    if (format === 'csv') {
      await writeCsv(res, filename, CUSTOMERS_EXPORT_COLUMNS, rows);
    } else {
      await writeXlsx(res, filename, CUSTOMERS_EXPORT_COLUMNS, rows);
    }
  }

  @Post('check-duplicate')
  @Roles('SALES_MANAGER')
  @ApiOperation({
    summary: 'Warn about look-alike customers before create (advisory only)',
  })
  checkDuplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckDuplicateCustomerDto,
  ) {
    return this.customersService.checkDuplicate(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by id' })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customersService.getById(user, id);
  }

  @Post()
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Create customer' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customersService.create(user, dto);
  }

  @Patch(':id')
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Update customer' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('SALES_MANAGER')
  @ApiOperation({ summary: 'Soft-delete customer' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.customersService.softDelete(user, id);
  }
}
