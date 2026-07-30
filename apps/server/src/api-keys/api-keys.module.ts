import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';

import { ApiKeysController } from './controllers/api-keys.controller';
import { ApiKeyRepository } from './repositories/api-key.repository';
import { ApiKeysService } from './services/api-keys.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyRepository],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
