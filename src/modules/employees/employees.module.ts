import { Module } from '@nestjs/common';

import { EmployeesImportService } from './employees-import.service';
import { EmployeesController } from './employees.controller';
import { EmployeesRepository } from './employees.repository';
import { EmployeesService } from './employees.service';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeesImportService, EmployeesRepository],
  exports: [EmployeesService],
})
export class EmployeesModule {}
