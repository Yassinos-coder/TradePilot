import { Module } from '@nestjs/common';

import { ApiKeysModule } from '../api-keys/api-keys.module';
import { CopierModule } from '../copier/copier.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { EaGatewayService } from './ea-gateway.service';
import { EaSharedModule } from './ea-shared.module';

@Module({
  imports: [ApiKeysModule, NotificationsModule, CopierModule, EaSharedModule],
  providers: [EaGatewayService],
  exports: [EaGatewayService],
})
export class EaModule {}
