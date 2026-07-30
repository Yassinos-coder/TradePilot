import { Module } from '@nestjs/common';

import { CopierModule } from '../copier/copier.module';
import { EaModule } from '../ea/ea.module';

import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  imports: [EaModule, CopierModule],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
