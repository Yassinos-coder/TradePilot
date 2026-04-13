import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { RequestUser } from '../auth/types/request-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

import { ExecutionService } from './execution.service';

@UseGuards(JwtAuthGuard)
@Controller('execution')
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  @Get('logs')
  listLogs(@CurrentUser() user: RequestUser, @Query('limit') limit?: string) {
    return this.executionService.listLogs(user.userId, Number(limit ?? 10));
  }
}
