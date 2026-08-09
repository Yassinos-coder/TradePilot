import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { CotReportMode, cotReportModeSchema } from '@tradepilot/shared';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { COT_DEFAULT_MARKET_CODE } from '../constants/cot-markets';
import { CotHistoryService } from '../services/cot-history.service';
import { CotAiService } from '../services/cot-ai.service';
import { CotService } from '../services/cot.service';

@UseGuards(JwtAuthGuard)
@Controller('cot')
export class CotController {
  constructor(
    private readonly cotService: CotService,
    private readonly cotHistoryService: CotHistoryService,
    private readonly cotAiService: CotAiService,
  ) {}

  @Get('markets')
  getMarkets() {
    return this.cotService.getMarkets();
  }

  @Get('reports/:code')
  getReport(@Param('code') code: string, @Query('mode') mode?: string) {
    return this.cotService.getReport(code || COT_DEFAULT_MARKET_CODE, this.toMode(mode));
  }

  @Get('reports/:code/history')
  getHistory(@Param('code') code: string, @Query('mode') mode?: string) {
    return this.cotHistoryService.getHistory(code || COT_DEFAULT_MARKET_CODE, this.toMode(mode));
  }

  @Get('reports/:code/analysis')
  getAnalysis(@Param('code') code: string, @Query('mode') mode?: string) {
    return this.cotAiService.analyze(code || COT_DEFAULT_MARKET_CODE, this.toMode(mode));
  }

  private toMode(mode?: string): CotReportMode {
    const parsed = cotReportModeSchema.safeParse(mode);
    return parsed.success ? parsed.data : 'futures';
  }
}
