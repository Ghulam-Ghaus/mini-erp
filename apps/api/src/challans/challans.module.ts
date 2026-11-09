import { Module } from '@nestjs/common';
import { ChallansController } from './challans.controller.js';
import { ChallansService } from './challans.service.js';

@Module({
  controllers: [ChallansController],
  providers: [ChallansService],
  exports: [ChallansService],
})
export class ChallansModule {}
