import { Module } from '@nestjs/common';

import { RedisModule } from '../redis/redis.module';

import { NewsController } from './controllers/news.controller';
import { NewsService } from './services/news.service';

@Module({
  imports: [RedisModule],
  controllers: [NewsController],
  providers: [NewsService],
})
export class NewsModule {}
