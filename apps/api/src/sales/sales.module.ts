import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { NumberingModule } from '../numbering/numbering.module.js';
import { StockModule } from '../stock/stock.module.js';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';

@Module({
  imports: [DatabaseModule, LedgerModule, StockModule, NumberingModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
