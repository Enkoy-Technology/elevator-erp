import { Module } from '@nestjs/common';

import { ElevatorCalcController } from './elevator-calc.controller';
import { ElevatorCalcService } from './elevator-calc.service';

@Module({
  controllers: [ElevatorCalcController],
  providers: [ElevatorCalcService],
  exports: [ElevatorCalcService],
})
export class ElevatorCalcModule {}
