import { Module } from '@nestjs/common';

import { EaModule } from '../ea/ea.module';

import { PositionProxyController } from './position-proxy.controller';
import { PositionProxyService } from './position-proxy.service';

@Module({
  imports: [EaModule],
  controllers: [PositionProxyController],
  providers: [PositionProxyService],
})
export class PositionProxyModule {}
