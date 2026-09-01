import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * An instalment is a PLAN; the invoice is the debt. This is the moment the
 * two meet: someone has raised the real invoice for a milestone and records
 * which one it was.
 */
export class MarkInstalmentInvoicedDto {
  @ApiProperty({ format: 'uuid', description: 'The invoice actually raised for this instalment.' })
  @IsUUID()
  invoiceId!: string;
}
