import {
  CotBias,
  CotCategoryDTO,
  CotCellDTO,
  CotMarketDTO,
  CotReportDTO,
  CotReportMode,
  CotSpeculatorSummaryDTO,
  CotTableDTO,
} from '@tradepilot/shared';

import { COT_FEED_LAYOUTS, COT_TABLE_LABELS } from '../constants/cot-feeds';
import { CotCategoryLayout, CotFeedKey, CotFeedLayout, CotFeedRow, CotMarketDefinition } from '../interfaces';
import { CotCsvUtil } from '../utils/cot-csv.util';

/** COT is a weekly Tuesday snapshot, so the change columns look back seven days. */
const REPORT_INTERVAL_DAYS = 7;

export class CotReportMapper {
  static toMarket(definition: CotMarketDefinition): CotMarketDTO {
    return {
      code: definition.code,
      label: definition.label,
      group: definition.group,
      exchange: definition.exchange,
      contractUnit: definition.contractUnit,
      symbol: definition.symbol,
    };
  }

  static toReport(
    definition: CotMarketDefinition,
    mode: CotReportMode,
    legacyRow: CotFeedRow,
    detailRow: CotFeedRow,
  ): CotReportDTO {
    const detailKind = definition.detail;
    const detailLayout = COT_FEED_LAYOUTS[detailKind];

    const legacyTable = this.toTable('legacy', legacyRow);
    const detailTable = this.toTable(detailKind, detailRow);

    const openInterest = CotCsvUtil.toNumber(detailRow.fields[detailLayout.positionsOffset]);

    return {
      market: this.toMarket(definition),
      mode,
      reportDate: detailRow.reportDate,
      previousDate: this.toPreviousDate(detailRow.reportDate),
      openInterest,
      openInterestChange: CotCsvUtil.toNumber(detailRow.fields[detailLayout.changesOffset]),
      totalTraders: CotCsvUtil.toNullableNumber(detailRow.fields[detailLayout.tradersOffset]),
      tables: [detailTable, legacyTable],
      speculators: this.toSpeculatorSummary(detailTable, detailLayout.speculatorKey, openInterest),
      fetchedAt: new Date().toISOString(),
    };
  }

  private static toTable(kind: CotFeedKey, row: CotFeedRow): CotTableDTO {
    const layout = COT_FEED_LAYOUTS[kind];

    return {
      kind,
      label: COT_TABLE_LABELS[kind],
      categories: layout.categories.map((category) => this.toCategory(row, layout, category)),
    };
  }

  private static toCategory(
    row: CotFeedRow,
    layout: CotFeedLayout,
    category: CotCategoryLayout,
  ): CotCategoryDTO {
    return {
      key: category.key,
      label: category.label,
      long: this.toCell(row, layout, category, category.long),
      short: this.toCell(row, layout, category, category.short),
      spreading:
        category.spreading === null ? null : this.toCell(row, layout, category, category.spreading),
    };
  }

  /**
   * Positions, changes, percentages and trader counts are parallel fixed-width
   * blocks, so one column index addresses a category in all four.
   */
  private static toCell(
    row: CotFeedRow,
    layout: CotFeedLayout,
    category: CotCategoryLayout,
    index: number,
  ): CotCellDTO {
    return {
      positions: CotCsvUtil.toNumber(row.fields[layout.positionsOffset + index]),
      change: CotCsvUtil.toNumber(row.fields[layout.changesOffset + index]),
      pctOi: CotCsvUtil.toNumber(row.fields[layout.percentOffset + index]),
      traders: category.hasTraders
        ? CotCsvUtil.toNullableNumber(row.fields[layout.tradersOffset + index])
        : null,
    };
  }

  private static toSpeculatorSummary(
    table: CotTableDTO,
    speculatorKey: string,
    openInterest: number,
  ): CotSpeculatorSummaryDTO {
    const category = table.categories.find((entry) => entry.key === speculatorKey);

    if (!category) {
      throw new Error(`Speculator category ${speculatorKey} missing from the ${table.kind} table`);
    }

    const long = category.long.positions;
    const short = category.short.positions;
    const net = long - short;

    return {
      label: category.label,
      long,
      short,
      net,
      netChange: category.long.change - category.short.change,
      longChange: category.long.change,
      shortChange: category.short.change,
      longShortRatio: short > 0 ? long / short : null,
      netPctOi: openInterest > 0 ? (net / openInterest) * 100 : 0,
      bias: this.toBias(net),
    };
  }

  private static toBias(net: number): CotBias {
    if (net > 0) return 'LONG';
    if (net < 0) return 'SHORT';
    return 'FLAT';
  }

  private static toPreviousDate(reportDate: string): string {
    const date = new Date(`${reportDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - REPORT_INTERVAL_DAYS);
    return date.toISOString().slice(0, 10);
  }
}
