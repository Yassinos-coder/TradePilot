import { CotFeedLayout } from '../interfaces';

/** Field positions that identify the market, ahead of the numeric blocks. */
const NAME_INDEX = 0;
const REPORT_DATE_INDEX = 2;
const CODE_INDEX = 3;
const EXCHANGE_INDEX = 4;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CotRowValidator {
  static isComplete(fields: string[], layout: CotFeedLayout): boolean {
    if (fields.length <= this.requiredLength(layout)) {
      return false;
    }

    const name = fields[NAME_INDEX] ?? '';
    const code = fields[CODE_INDEX] ?? '';
    const exchange = fields[EXCHANGE_INDEX] ?? '';
    const reportDate = fields[REPORT_DATE_INDEX] ?? '';

    return (
      name.length > 0 && code.length > 0 && exchange.length > 0 && ISO_DATE.test(reportDate)
    );
  }

  /**
   * The traders block is the last one this parser reads, and its widest column
   * is whichever category sits furthest right in it.
   */
  private static requiredLength(layout: CotFeedLayout): number {
    const tradedIndexes = layout.categories
      .filter((category) => category.hasTraders)
      .flatMap((category) => [category.long, category.short, category.spreading ?? 0]);

    return layout.tradersOffset + Math.max(...tradedIndexes);
  }
}
