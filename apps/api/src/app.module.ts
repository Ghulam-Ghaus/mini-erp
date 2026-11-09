import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BackupModule } from './backup/backup.module.js';
import { BatchesModule } from './batches/batches.module.js';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { ItemsModule } from './items/items.module.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { NumberingModule } from './numbering/numbering.module.js';
import { OrgModule } from './org/org.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PurchasesModule } from './purchases/purchases.module.js';
import { RoutesModule } from './routes/routes.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { SalesModule } from './sales/sales.module.js';
import { SaleReturnsModule } from './sale-returns/sale-returns.module.js';
import { RecoveryModule } from './recovery/recovery.module.js';
import { ChallansModule } from './challans/challans.module.js';
import { ExpensesModule } from './expenses/expenses.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PayrollModule } from './payroll/payroll.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { StockModule } from './stock/stock.module.js';
import { SuppliersModule } from './suppliers/suppliers.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AuditModule,
    NumberingModule,
    LedgerModule,
    StockModule,
    HealthModule,
    OrgModule,
    AuthModule,
    UsersModule,
    ItemsModule,
    SuppliersModule,
    PaymentsModule,
    PurchasesModule,
    BatchesModule,
    RoutesModule,
    ClientsModule,
    SalesModule,
    SaleReturnsModule,
    RecoveryModule,
    ChallansModule,
    ExpensesModule,
    PayrollModule,
    ReportsModule,
    NotificationsModule,
    BackupModule,
  ],
})
export class AppModule {}
