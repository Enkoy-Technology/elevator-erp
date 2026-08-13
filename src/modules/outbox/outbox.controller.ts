import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
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
import { messageChannelEnum, messageStatusEnum } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import type { OutboxListFilter } from './outbox.repository';
import { OutboxService } from './outbox.service';

const MESSAGE_STATUSES = messageStatusEnum.enumValues;
const MESSAGE_CHANNELS = messageChannelEnum.enumValues;

// Same shape as payments.controller.ts's own DATE_ONLY_RE + round-trip
// check — duplicated per this codebase's established "2nd+ occurrence,
// duplicate a controller-local inline validator rather than extract"
// convention. Without the round-trip check, the regex alone lets a
// calendar-invalid date like 2026-13-45 through, which then 500s instead of
// 400ing wherever it's actually used as a date.
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseOptionalCalendarDate(
  paramName: string,
  value: string | undefined,
): string | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (!DATE_ONLY_RE.test(value)) {
    throw new BadRequestException(`${paramName} must be an ISO date (YYYY-MM-DD)`);
  }
  // An out-of-range DAY (e.g. 2026-02-30) rolls over to a real date
  // (2026-03-02) rather than throwing, so the plain string-mismatch check
  // below catches it — same as the sibling controllers' copy of this
  // function. An out-of-range MONTH (e.g. 2026-13-45, this nit's own
  // example) makes `new Date(...)` unparseable, and `.toISOString()` throws
  // RangeError on an Invalid Date rather than returning a mismatched
  // string — sibling controllers don't guard this, but the review's own
  // example is exactly this case, so it's guarded here rather than copied
  // as a bug alongside the fix.
  const parsed = new Date(`${value}T00:00:00Z`);
  const roundTrip = Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().slice(0, 10);
  if (roundTrip !== value) {
    throw new BadRequestException(`${paramName} is not a valid calendar date`);
  }
  return value;
}

export const OUTBOX_EXPORT_COLUMNS: ColumnDef[] = [
  { key: 'id', header: 'ID' },
  { key: 'channel', header: 'Channel' },
  { key: 'recipient', header: 'Recipient' },
  { key: 'body', header: 'Body' },
  { key: 'segments', header: 'Segments' },
  { key: 'status', header: 'Status' },
  { key: 'attempts', header: 'Attempts' },
  { key: 'providerName', header: 'Provider' },
  { key: 'providerMessageId', header: 'Provider Message ID' },
  { key: 'subjectKind', header: 'Subject Kind' },
  { key: 'subjectId', header: 'Subject ID' },
  { key: 'sentAt', header: 'Sent At', format: 'date' },
  { key: 'nextAttemptAt', header: 'Next Attempt At', format: 'date' },
  { key: 'lastError', header: 'Last Error' },
  { key: 'createdAt', header: 'Created At', format: 'date' },
];

/**
 * The message log (task-3 brief §3.3): "did the SMS go out?", answerable by
 * an operator without reading server logs. `@Roles('ADMIN')` — CEO/ADMIN
 * only via RolesGuard's SUPER_ROLES, same shape as EmployeesController/
 * SettingsController — this table carries every message ever sent to every
 * customer/technician, not something a SALES_MANAGER or FINANCE role needs
 * to browse.
 */
@ApiTags('outbox')
@ApiBearerAuth('access-token')
@Controller('outbox')
@Roles('ADMIN')
export class OutboxController {
  constructor(private readonly outboxService: OutboxService) {}

  /**
   * Nothing sends unless a real provider (`AFROMESSAGE_API_KEY`/
   * `GEEZSMS_TOKEN`) is configured — 'noop' here means every message on
   * this page was logged, never actually delivered (task-3 brief §3.3:
   * "nobody mistakes a dev deployment for a live one"). No route-ordering
   * concern with `:id/retry` below — different HTTP method and path depth,
   * unlike InvoicesController's aging-vs-:id case.
   */
  @Get('provider')
  @ApiOperation({ summary: 'Which SmsProvider is configured — "noop" sends nothing' })
  @ApiOkResponse({ description: 'The configured provider name' })
  getProvider(): { provider: string } {
    return { provider: this.outboxService.getSmsProviderName() };
  }

  @Get()
  @ApiOperation({
    summary:
      'List outbound messages (status/channel/date-range filter + pagination), or stream a CSV/XLSX export with ?format=',
  })
  @ApiOkResponse({ description: 'Paginated message log' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: false }) res: Response,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('format') formatRaw?: string,
  ): Promise<void> {
    const filter = this.parseFilter(status, channel, from, to);
    const format = parseExportFormat(formatRaw);
    if (!format) {
      const result = await this.outboxService.list(user, filter, page, pageSize);
      res.json(result);
      return;
    }
    const rows = this.outboxService.streamAll(user, filter);
    const filename = `outbox-${todayIso()}`;
    if (format === 'csv') {
      await writeCsv(res, filename, OUTBOX_EXPORT_COLUMNS, rows);
    } else {
      await writeXlsx(res, filename, OUTBOX_EXPORT_COLUMNS, rows);
    }
  }

  @Post(':id/retry')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Retry a FAILED message — sets QUEUED, due immediately, and keeps the attempt history (attempts is never reset)',
  })
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.outboxService.retry(user, id);
  }

  private parseFilter(
    status?: string,
    channel?: string,
    from?: string,
    to?: string,
  ): OutboxListFilter {
    if (status !== undefined && !(MESSAGE_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException(
        `status must be one of: ${MESSAGE_STATUSES.join(', ')}`,
      );
    }
    if (
      channel !== undefined &&
      !(MESSAGE_CHANNELS as readonly string[]).includes(channel)
    ) {
      throw new BadRequestException(
        `channel must be one of: ${MESSAGE_CHANNELS.join(', ')}`,
      );
    }
    return {
      status: status as OutboxListFilter['status'],
      channel: channel as OutboxListFilter['channel'],
      from: parseOptionalCalendarDate('from', from),
      to: parseOptionalCalendarDate('to', to),
    };
  }
}
