import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { CotReportMode } from '@tradepilot/shared';

import {
  COT_HISTORY_DATASETS,
  COT_REPORT_DATE_FIELD,
  COT_SOCRATA_BASE_URL,
  COT_SOCRATA_PAGE_LIMIT,
} from '../constants/cot-history';
import { CotFeedKey, CotSocrataRow } from '../interfaces';

const FETCH_TIMEOUT_MS = 30_000;

/**
 * The weekly `.txt` releases only ever hold the newest report, so anything
 * historical comes from the CFTC's Socrata API instead.
 */
@Injectable()
export class CotSocrataService {
  private readonly logger = new Logger(CotSocrataService.name);

  async fetchRows(
    key: CotFeedKey,
    mode: CotReportMode,
    code: string,
    afterDate: string,
    fields: string[],
  ): Promise<CotSocrataRow[]> {
    const url = new URL(`${COT_SOCRATA_BASE_URL}/${COT_HISTORY_DATASETS[key][mode]}.json`);

    url.searchParams.set('$select', [COT_REPORT_DATE_FIELD, ...fields].join(','));
    url.searchParams.set(
      '$where',
      `cftc_contract_market_code='${code}' AND ${COT_REPORT_DATE_FIELD}>'${afterDate}'`,
    );
    url.searchParams.set('$order', `${COT_REPORT_DATE_FIELD} ASC`);
    url.searchParams.set('$limit', String(COT_SOCRATA_PAGE_LIMIT));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new ServiceUnavailableException(`CFTC history API returned ${response.status}`);
      }

      const payload = (await response.json()) as unknown;

      if (!Array.isArray(payload)) {
        throw new ServiceUnavailableException('CFTC history API returned an unexpected shape');
      }

      return payload as CotSocrataRow[];
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.warn(`COT history fetch failed for ${code} (${key}/${mode}): ${String(error)}`);
      throw new ServiceUnavailableException('Could not reach the CFTC historical data API');
    } finally {
      clearTimeout(timeout);
    }
  }
}
