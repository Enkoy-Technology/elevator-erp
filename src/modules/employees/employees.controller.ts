import {
  Body,
  Controller,
  Get,
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

import { todayIso } from '../../common/business-time';
import { CurrentUser, Roles } from '../../common/decorators';
import { parseExportFormat } from '../../common/export/export-query.dto';
import { type ColumnDef, writeCsv, writeXlsx } from '../../common/export/tabular';
import type { AuthenticatedUser } from '../../types/auth.types';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';
import { EmployeesService } from './employees.service';

// No passwordHash/refreshTokenHash here — EmployeesRepository.list()/streamAll()
// already select an explicit column set that never includes either.
export const EMPLOYEES_EXPORT_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'ID' },
  { key: 'email', header: 'Email' },
  { key: 'fullName', header: 'Full Name' },
  { key: 'phone', header: 'Phone' },
  { key: 'role', header: 'Role' },
  { key: 'isActive', header: 'Active' },
  { key: 'lastLoginAt', header: 'Last Login At', format: 'date' },
  { key: 'createdAt', header: 'Created At', format: 'date' },
];

@ApiTags('employees')
@ApiBearerAuth('access-token')
@Controller('employees')
@Roles('ADMIN')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @ApiOperation({
    summary:
      'List employees (paginated), or stream a CSV/XLSX export with ?format=',
  })
  @ApiOkResponse({ description: 'Paginated employees' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: false }) res: Response,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
    @Query('format') formatRaw?: string,
  ): Promise<void> {
    const format = parseExportFormat(formatRaw);
    if (!format) {
      const result = await this.employeesService.list(user, {
        page,
        pageSize,
        q,
      });
      res.json(result);
      return;
    }
    const rows = this.employeesService.streamAll(user, { q });
    const filename = `employees-${todayIso()}`;
    if (format === 'csv') {
      await writeCsv(res, filename, EMPLOYEES_EXPORT_COLUMNS, rows);
    } else {
      await writeXlsx(res, filename, EMPLOYEES_EXPORT_COLUMNS, rows);
    }
  }

  @Post()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Add employee with role' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeesService.create(user, dto);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Update employee role / status' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(user, id, dto);
  }
}
