import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module.js';
import { RecoveryController } from './recovery.controller.js';
import { RecoveryService } from './recovery.service.js';

@Module({
  imports: [PaymentsModule],
  controllers: [RecoveryController],
  providers: [RecoveryService],
  exports: [RecoveryService],
})
export class RecoveryModule {}
