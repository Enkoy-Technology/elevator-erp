import { Module } from '@nestjs/common';

import { RatesRepository } from './rates.repository';
import { RatesService } from './rates.service';

@Module({
  providers: [RatesService, RatesRepository],
  exports: [RatesService],
})
export class RatesModule {}
