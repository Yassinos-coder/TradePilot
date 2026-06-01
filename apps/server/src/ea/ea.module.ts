import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';

import { EaGatewayService } from './ea-gateway.service';

@Module({
  imports: [UsersModule, NotificationsModule],
  providers: [EaGatewayService],
  exports: [EaGatewayService],
})
export class EaModule {}
