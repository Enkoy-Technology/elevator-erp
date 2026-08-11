import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthenticatedUser } from '../../types/auth.types';
import { AllocatePaymentDto } from './dto/allocate-payment.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ReversePaymentDto } from './dto/reverse-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth('access-token')
@Controller('payments')
@Roles('FINANCE')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Record a receipt, optionally allocating it against one or more invoices in the same transaction',
  })
  record(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.record(user, dto);
  }

  @Post(':id/allocations')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Allocate an existing payment against an invoice (over-allocation guards apply)',
  })
  allocate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AllocatePaymentDto,
  ) {
    return this.paymentsService.allocate(user, id, dto);
  }

  @Post(':id/reverse')
  @HttpCode(201)
  @ApiOperation({
    summary:
      'Reverse a payment: inserts a new mirroring payment with negated amounts (the original is never edited)',
  })
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReversePaymentDto,
  ) {
    return this.paymentsService.reverse(user, id, dto.reason);
  }
}
