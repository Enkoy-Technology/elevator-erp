import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import { ImportEmployeesResultDto } from './dto/import-employees.dto';
import { EmployeesImportService } from './employees-import.service';
import { EmployeesService } from './employees.service';

/**
 * A staff list is a few dozen rows; 2 MB is already generous for one. The cap
 * is enforced by multer before the body is buffered, so an oversized upload is
 * rejected at the socket rather than parsed.
 */
const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;

const IMPORT_EXTENSIONS = /\.(xlsx|csv)$/i;

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
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly employeesImportService: EmployeesImportService,
  ) {}

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

  @Post('import')
  @Roles('ADMIN')
  @UseInterceptors(
    // No `storage` option: multer's default IS memory storage, so the upload
    // never touches disk. An explicit `memoryStorage()` would mean importing
    // `multer` directly, which isn't a declared dependency here.
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
      fileFilter: (_req, file, cb) => {
        cb(
          IMPORT_EXTENSIONS.test(file.originalname)
            ? null
            : new BadRequestException(
                `"${file.originalname}" is not a spreadsheet. Upload a .xlsx or .csv file.`,
              ),
          true,
        );
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'The staff list, .xlsx or .csv.',
        },
        commit: {
          type: 'string',
          description:
            'Send "true" to actually create the employees. Anything else (or absent) is a dry run that writes nothing.',
        },
      },
    },
  })
  @ApiOperation({
    summary:
      'Import employees from a spreadsheet. Dry run by default — send commit=true to write.',
  })
  @ApiOkResponse({ type: ImportEmployeesResultDto })
  import(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('commit') commit?: string,
  ): Promise<ImportEmployeesResultDto> {
    if (!file) {
      throw new BadRequestException(
        'No file uploaded. Attach the spreadsheet as the "file" field.',
      );
    }
    return this.employeesImportService.import(user, file, commit === 'true');
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
