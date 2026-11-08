import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { NumberingModule } from '../numbering/numbering.module.js';
import { StockModule } from '../stock/stock.module.js';
import { SaleReturnsController } from './sale-returns.controller.js';
import { SaleReturnsService } from './sale-returns.service.js';

@Module({
  imports: [DatabaseModule, LedgerModule, StockModule, NumberingModule],
  controllers: [SaleReturnsController],
  providers: [SaleReturnsService],
  exports: [SaleReturnsService],
})
export class SaleReturnsModule {}
