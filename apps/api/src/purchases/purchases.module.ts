import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { PurchasesController } from './purchases.controller.js';
import { PurchasesService } from './purchases.service.js';

@Module({
  imports: [PaymentsModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}
