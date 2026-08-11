import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { ExportModule } from './common/export/export.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard, RolesGuard, TenantGuard } from './common/guards';
import { AppConfigModule } from './config';
import { DatabaseModule } from './database/database.module';
import { AssetsModule } from './modules/assets/assets.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ElevatorCalcModule } from './modules/elevator-calc/elevator-calc.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ProformasModule } from './modules/proformas/proformas.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { RatesModule } from './modules/rates/rates.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    // TAD §3.1: 1,000 req/min per tenant with 200 req/10s burst.
    // In-memory for Phase 0; swap to Redis storage when workers land.
    ThrottlerModule.forRoot([
      { name: 'burst', ttl: 10_000, limit: 200 },
      { name: 'sustained', ttl: 60_000, limit: 1000 },
    ]),
    AuthModule,
    ElevatorCalcModule,
    ExportModule,
    CustomersModule,
    ProjectsModule,
    QuotationsModule,
    ProformasModule,
    InvoicesModule,
    PaymentsModule,
    EmployeesModule,
    AssetsModule,
    NotificationsModule,
    MaintenanceModule,
    RatesModule,
    SettingsModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: throttle -> authenticate -> tenant check -> role check.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
