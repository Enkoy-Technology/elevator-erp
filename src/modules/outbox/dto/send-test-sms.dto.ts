import { ApiProperty } from '@nestjs/swagger';
import { IsString, Validate } from 'class-validator';

import { IsEthiopianPhoneConstraint } from '../../../common/dto/phone';

/** A one-off test message to prove the configured gateway delivers. */
export class SendTestSmsDto {
  @ApiProperty({ example: '+251949922604', description: 'Ethiopian mobile number, any common format.' })
  @IsString()
  @Validate(IsEthiopianPhoneConstraint)
  phone!: string;
}
