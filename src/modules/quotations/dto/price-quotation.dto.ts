import { ApiProperty } from '@nestjs/swagger';
import { Matches, Validate } from 'class-validator';

import { MONEY_RE, PositiveMoneyConstraint } from '../../../common/dto/money';

/**
 * The sales manager types the round figure the customer pays — VAT
 * INCLUSIVE, exactly as it appears on the client's own proforma
 * (7,835,000.00). Everything else on the document is derived backwards from
 * it: see QuotationsService.priceFromGrandTotal.
 *
 * No discount amount and no approver id are accepted here. The discount is
 * the gap between the calculator and this number, so letting a caller state
 * it would let the two disagree; and an approver is stamped by the person
 * approving, on their own endpoint, not named by the person being approved.
 */
export class PriceQuotationDto {
  @ApiProperty({
    example: '7835000.00',
    description: 'VAT-inclusive grand total, as a decimal string in ETB.',
  })
  @Matches(MONEY_RE, {
    message:
      'grandTotalEtb must be a money amount, up to 2 decimal places',
  })
  @Validate(PositiveMoneyConstraint)
  grandTotalEtb!: string;
}
