import { Module } from '@nestjs/common';

import { CustomersController } from './customers.controller';
import { CustomersRepository } from './customers.repository';
import { CustomersService } from './customers.service';
import { DuplicateDetectionService } from './duplicate-detection.service';

@Module({
  controllers: [CustomersController],
  providers: [
    CustomersService,
    CustomersRepository,
    DuplicateDetectionService,
  ],
  exports: [CustomersService],
})
export class CustomersModule {}
