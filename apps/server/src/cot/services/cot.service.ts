import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import { CotMarketListDTO, CotReportDTO, CotReportMode } from '@tradepilot/shared';

import { COT_MARKETS, COT_MARKETS_BY_CODE } from '../constants/cot-markets';
import { CotReportMapper } from '../mappers/cot-report.mapper';

import { CotFeedService } from './cot-feed.service';

@Injectable()
export class CotService {
  constructor(private readonly cotFeedService: CotFeedService) {}

  getMarkets(): CotMarketListDTO {
    return { markets: COT_MARKETS.map((market) => CotReportMapper.toMarket(market)) };
  }

  async getReport(code: string, mode: CotReportMode): Promise<CotReportDTO> {
    const definition = COT_MARKETS_BY_CODE.get(code);

    if (!definition) {
      throw new NotFoundException(`Unknown COT market ${code}`);
    }

    // Legacy carries the Non-Commercial/Commercial view; the detail release
    // carries the trader breakdown. Both are needed to render the page.
    const [legacyRows, detailRows] = await Promise.all([
      this.cotFeedService.getRows('legacy', mode),
      this.cotFeedService.getRows(definition.detail, mode),
    ]);

    const legacyRow = legacyRows[code];
    const detailRow = detailRows[code];

    if (!legacyRow || !detailRow) {
      throw new ServiceUnavailableException(
        `${definition.label} is missing from the latest CFTC release`,
      );
    }

    return CotReportMapper.toReport(definition, mode, legacyRow, detailRow);
  }
}
