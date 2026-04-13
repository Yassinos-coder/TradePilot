import { Controller, Get } from '@nestjs/common';

import { DatabaseService } from './database/database.service';
import { RedisService } from './redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  async check() {
    const [databaseOk, redisOk] = await Promise.all([
      this.databaseService.ping(),
      this.redisService.ping(),
    ]);

    return {
      status: databaseOk && redisOk ? 'ok' : 'degraded',
      api: 'ok',
      database: databaseOk ? 'up' : 'down',
      redis: redisOk ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
  }
}
