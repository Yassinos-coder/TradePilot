import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { signalHistoryFilterSchema, softDeleteSignalsSchema } from '@tradepilot/shared';

import { RequestUser } from '../auth/types/request-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import { SignalsService } from './signals.service';

const manualSignalSchema = z.object({
  rawMessage: z.string().min(10),
  sourceChannel: z.string().optional(),
});

type ManualSignalInput = z.infer<typeof manualSignalSchema>;

@UseGuards(JwtAuthGuard)
@Controller('signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Get()
  listSignals(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
    @Query('filter') filter?: string,
    @Query('includeNoise') includeNoise?: string,
  ) {
    const normalizedFilter = signalHistoryFilterSchema.safeParse(
      typeof filter === 'string' ? filter.toUpperCase() : 'ALL',
    );

    return this.signalsService.listRecentSignals(
      user.userId,
      Number(limit ?? 10),
      normalizedFilter.success ? normalizedFilter.data : 'ALL',
      includeNoise === 'true',
    );
  }

  @Post('ingest')
  ingestSignal(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(manualSignalSchema)) body: ManualSignalInput,
  ) {
    return this.signalsService.ingestRawSignal(
      user.userId,
      body.rawMessage,
      body.sourceChannel,
    );
  }

  @Post('history/delete')
  deleteSignalHistory(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(softDeleteSignalsSchema))
    body: z.infer<typeof softDeleteSignalsSchema>,
  ) {
    return this.signalsService.softDeleteSignals(user.userId, body);
  }
}
