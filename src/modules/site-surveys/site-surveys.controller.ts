import {
  BadRequestException,
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

import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthenticatedUser } from '../../types/auth.types';
import { ImportSiteSurveysResultDto } from './dto/import-site-surveys.dto';
import {
  CreateSiteSurveyDto,
  UpdateSiteSurveyDto,
} from './dto/site-survey.dto';
import { SiteSurveysImportService } from './site-surveys-import.service';
import { SiteSurveysService } from './site-surveys.service';

/**
 * One site collection form is a few dozen rows; 2 MB is generous. multer
 * enforces the cap before the body is buffered, so an oversized upload is
 * rejected at the socket rather than parsed.
 */
const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024;

const IMPORT_EXTENSIONS = /\.(xlsx|csv)$/i;

/**
 * The company's SITE COLLECTION FORM, captured in the ERP instead of sent to
 * the manager over Telegram. Deliberately standalone (client, 2026-09-22):
 * nothing here touches quotations, projects, customers or the calculator.
 */
@ApiTags('site-surveys')
@ApiBearerAuth('access-token')
@Controller('site-surveys')
@Roles(
  'SALESPERSON',
  'SALES_MANAGER',
  'GENERAL_MANAGER',
  'TECHNICAL_MANAGER',
  'OFFICE_MANAGER',
  'SECRETARY',
)
export class SiteSurveysController {
  constructor(
    private readonly siteSurveysService: SiteSurveysService,
    private readonly siteSurveysImportService: SiteSurveysImportService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'List site surveys, newest first. A salesperson sees only their own.',
  })
  @ApiOkResponse({ description: 'Paginated site survey list' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.siteSurveysService.list(user, { search, page, pageSize });
  }

  @Post()
  @ApiOperation({ summary: 'Submit a site collection form' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSiteSurveyDto,
  ) {
    return this.siteSurveysService.create(user, dto);
  }

  @Post('import')
  @UseInterceptors(
    // No `storage` option: multer's default IS memory storage, so the upload
    // never touches disk.
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
          description: 'The filled SITE COLLECTION FORM, .xlsx or .csv.',
        },
        commit: {
          type: 'string',
          description:
            'Send "true" to actually save the surveys. Anything else (or absent) is a dry run that writes nothing.',
        },
      },
    },
  })
  @ApiOperation({
    summary:
      'Import site surveys from the filled site collection form. Dry run by default — send commit=true to write.',
  })
  @ApiOkResponse({ type: ImportSiteSurveysResultDto })
  import(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('commit') commit?: string,
  ): Promise<ImportSiteSurveysResultDto> {
    if (!file) {
      throw new BadRequestException(
        'No file uploaded. Attach the spreadsheet as the "file" field.',
      );
    }
    return this.siteSurveysImportService.import(user, file, commit === 'true');
  }

  @Get(':id')
  @ApiOperation({
    summary: "Get one site survey. 404 for a salesperson asking for another's.",
  })
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.siteSurveysService.getById(user, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Correct a site survey. A salesperson may change only their own sheet.',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSiteSurveyDto,
  ) {
    return this.siteSurveysService.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Delete a site survey. A salesperson may delete only their own sheet.',
  })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.siteSurveysService.delete(user, id);
  }
}
