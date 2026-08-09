import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { CotHistoryDTO, CotReportMode } from '@tradepilot/shared';

import { COT_FEED_LAYOUTS } from '../constants/cot-feeds';
import { COT_HISTORY_POINT_LIMIT } from '../constants/cot-history';
import { COT_MARKETS_BY_CODE } from '../constants/cot-markets';
import { CotMarketDefinition } from '../interfaces';
import { CotHistoryMapper } from '../mappers/cot-history.mapper';
import { CotReportMapper } from '../mappers/cot-report.mapper';
import { CotHistoryRepository } from '../repositories/cot-history.repository';

import { CotBackfillService } from './cot-backfill.service';

@Injectable()
export class CotHistoryService {
  private readonly logger = new Logger(CotHistoryService.name);

  constructor(
    private readonly cotHistoryRepository: CotHistoryRepository,
    private readonly cotBackfillService: CotBackfillService,
  ) {}

  async getHistory(code: string, mode: CotReportMode): Promise<CotHistoryDTO> {
    const definition = COT_MARKETS_BY_CODE.get(code);

    if (!definition) {
      throw new NotFoundException(`Unknown COT market ${code}`);
    }

    // The weekly job keeps this current; backfilling here covers a market opened
    // before its first sweep, and a failure is only fatal when it leaves us with
    // nothing to show.
    let backfillError: unknown = null;

    try {
      await this.cotBackfillService.backfillMarket(definition, mode);
    } catch (error) {
      backfillError = error;
      this.logger.warn(`COT history backfill failed for ${code}/${mode}: ${String(error)}`);
    }

    const records = await this.cotHistoryRepository.listRecent(code, mode, COT_HISTORY_POINT_LIMIT);

    if (records.length === 0 && backfillError) {
      throw backfillError;
    }

    return CotHistoryMapper.toHistory(
      CotReportMapper.toMarket(definition),
      mode,
      this.toSpeculatorLabel(definition),
      records,
    );
  }

  private toSpeculatorLabel(definition: CotMarketDefinition): string {
    const layout = COT_FEED_LAYOUTS[definition.detail];
    const category = layout.categories.find((entry) => entry.key === layout.speculatorKey);

    return category?.label ?? 'Speculators';
  }
}
