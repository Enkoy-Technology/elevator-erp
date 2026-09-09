import { Module } from '@nestjs/common';

import { ElevatorCalcController } from './elevator-calc.controller';
import { ElevatorCalcService } from './elevator-calc.service';
import { ProductTypesController } from './product-types.controller';
import { ProductTypesRepository } from './product-types.repository';

@Module({
  controllers: [ElevatorCalcController, ProductTypesController],
  providers: [ElevatorCalcService, ProductTypesRepository],
  exports: [ElevatorCalcService, ProductTypesRepository],
})
export class ElevatorCalcModule {}
