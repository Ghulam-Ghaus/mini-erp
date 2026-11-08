import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { RoutesController } from './routes.controller.js';
import { RoutesService } from './routes.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [RoutesController],
  providers: [RoutesService],
  exports: [RoutesService],
})
export class RoutesModule {}
