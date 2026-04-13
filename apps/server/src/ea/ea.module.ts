import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module';

import { EaGatewayService } from './ea-gateway.service';

@Module({
  imports: [UsersModule],
  providers: [EaGatewayService],
  exports: [EaGatewayService],
})
export class EaModule {}
