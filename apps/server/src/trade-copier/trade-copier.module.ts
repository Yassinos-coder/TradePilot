import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';

import { TradeCopierController } from './trade-copier.controller';
import { TradeCopierService } from './trade-copier.service';

@Module({
  controllers: [TradeCopierController],
  imports: [DatabaseModule],
  providers: [TradeCopierService],
  exports: [TradeCopierService],
})
export class TradeCopierModule {}
