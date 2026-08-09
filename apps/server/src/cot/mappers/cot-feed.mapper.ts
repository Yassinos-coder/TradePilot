import { CotFeedLayout, CotFeedRow } from '../interfaces';
import { CotCsvUtil } from '../utils/cot-csv.util';
import { CotRowValidator } from '../validators/cot-row.validator';

const NAME_INDEX = 0;
const REPORT_DATE_INDEX = 2;
const CODE_INDEX = 3;
const EXCHANGE_INDEX = 4;

export class CotFeedMapper {
  /**
   * A release carries every market of its report. Only the watchlist is kept so
   * the cached payload stays a few kilobytes instead of a few hundred.
   */
  static toRows(body: string, layout: CotFeedLayout, codes: Set<string>): Record<string, CotFeedRow> {
    const rows: Record<string, CotFeedRow> = {};

    for (const line of body.split('\n')) {
      const trimmed = line.trim();

      if (trimmed.length === 0) {
        continue;
      }

      const fields = CotCsvUtil.parseLine(trimmed);

      if (!CotRowValidator.isComplete(fields, layout)) {
        continue;
      }

      const code = fields[CODE_INDEX] ?? '';

      if (!codes.has(code)) {
        continue;
      }

      rows[code] = {
        name: fields[NAME_INDEX] ?? '',
        code,
        exchange: fields[EXCHANGE_INDEX] ?? '',
        reportDate: fields[REPORT_DATE_INDEX] ?? '',
        fields,
      };
    }

    return rows;
  }
}
