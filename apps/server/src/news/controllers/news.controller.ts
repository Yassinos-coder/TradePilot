import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { NewsRange, newsRangeSchema } from '@tradepilot/shared';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NewsService } from '../services/news.service';

@UseGuards(JwtAuthGuard)
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get('calendar')
  getCalendar(@Query('range') range?: string) {
    const parsed = newsRangeSchema.safeParse(range);
    const resolved: NewsRange = parsed.success ? parsed.data : 'thisweek';

    return this.newsService.getCalendar(resolved);
  }

  @Get('indicator')
  getIndicator(@Query('title') title?: string) {
    return this.newsService.getIndicatorDetail(title ?? '');
  }
}
