import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';

@Module({
  imports: [DatabaseModule, LedgerModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
