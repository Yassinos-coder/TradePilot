import { Injectable, Logger } from '@nestjs/common';

import { CotReportMode, cotReportModeSchema } from '@tradepilot/shared';

import {
  COT_HISTORY_START_EXCLUSIVE,
  COT_LEGACY_HISTORY_FIELDS,
  COT_SPECULATOR_FIELDS,
} from '../constants/cot-history';
import { COT_MARKETS } from '../constants/cot-markets';
import { CotBackfillSummary, CotMarketDefinition } from '../interfaces';
import { CotHistoryMapper } from '../mappers/cot-history.mapper';
import { CotHistoryRepository } from '../repositories/cot-history.repository';

import { CotFeedService } from './cot-feed.service';
import { CotSocrataService } from './cot-socrata.service';

const MODES = cotReportModeSchema.options;

@Injectable()
export class CotBackfillService {
  private readonly logger = new Logger(CotBackfillService.name);

  constructor(
    private readonly cotHistoryRepository: CotHistoryRepository,
    private readonly cotSocrataService: CotSocrataService,
    private readonly cotFeedService: CotFeedService,
  ) {}

  /**
   * Sweeps every tracked market in both modes. The weekly cache is dropped first
   * so the freshness check compares against the release that just landed rather
   * than the copy taken before it.
   */
  async backfillAll(): Promise<CotBackfillSummary> {
    await this.cotFeedService.invalidate();

    const summary: CotBackfillSummary = { markets: 0, weeks: 0, failures: [] };

    for (const definition of COT_MARKETS) {
      for (const mode of MODES) {
        try {
          summary.weeks += await this.backfillMarket(definition, mode);
          summary.markets += 1;
        } catch (error) {
          summary.failures.push(`${definition.code}/${mode}`);
          this.logger.warn(`Backfill failed for ${definition.code}/${mode}: ${String(error)}`);
        }
      }
    }

    return summary;
  }

  /**
   * Pulls whatever the archive holds beyond what is already stored. The first
   * run for a market fetches its full history; later runs fetch only new weeks.
   */
  async backfillMarket(definition: CotMarketDefinition, mode: CotReportMode): Promise<number> {
    const [storedDate, releasedDate] = await Promise.all([
      this.cotHistoryRepository.getLatestReportDate(definition.code, mode),
      this.getLatestReleaseDate(definition, mode),
    ]);

    if (storedDate && releasedDate && storedDate >= releasedDate) {
      return 0;
    }

    const specFields = COT_SPECULATOR_FIELDS[definition.detail];
    const afterDate = storedDate ?? COT_HISTORY_START_EXCLUSIVE;

    const [legacyRows, detailRows] = await Promise.all([
      this.cotSocrataService.fetchRows(
        'legacy',
        mode,
        definition.code,
        afterDate,
        Object.values(COT_LEGACY_HISTORY_FIELDS),
      ),
      this.cotSocrataService.fetchRows(
        definition.detail,
        mode,
        definition.code,
        afterDate,
        Object.values(specFields),
      ),
    ]);

    const records = CotHistoryMapper.toRecords(
      definition.code,
      mode,
      legacyRows,
      detailRows,
      specFields,
    );

    if (records.length === 0) {
      return 0;
    }

    await this.cotHistoryRepository.upsertMany(records);
    this.logger.log(`Stored ${records.length} COT weeks for ${definition.code}/${mode}`);

    return records.length;
  }

  /**
   * The weekly release is already cached for the report page, so reusing it
   * costs nothing. If it is unreachable, treat the cursor as unknown and let the
   * archive query decide what is missing.
   */
  private async getLatestReleaseDate(
    definition: CotMarketDefinition,
    mode: CotReportMode,
  ): Promise<string | null> {
    try {
      const rows = await this.cotFeedService.getRows(definition.detail, mode);
      return rows[definition.code]?.reportDate ?? null;
    } catch (error) {
      this.logger.warn(`Could not resolve the latest COT release date: ${String(error)}`);
      return null;
    }
  }
}
