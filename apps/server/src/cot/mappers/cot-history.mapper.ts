import {
  CotHistoryDTO,
  CotHistoryPointDTO,
  CotIndexWindowDTO,
  CotMarketDTO,
  CotReportMode,
} from '@tradepilot/shared';

import {
  COT_INDEX_WINDOWS,
  COT_LEGACY_HISTORY_FIELDS,
  COT_REPORT_DATE_FIELD,
} from '../constants/cot-history';
import { CotHistoryRecord, CotSocrataRow, CotSpeculatorFields } from '../interfaces';

export class CotHistoryMapper {
  /**
   * Legacy and detail history live in separate datasets, so the two result sets
   * are joined on report date. A week missing from either side is dropped —
   * a row without its speculative bucket cannot answer what the page asks.
   */
  static toRecords(
    code: string,
    mode: CotReportMode,
    legacyRows: CotSocrataRow[],
    detailRows: CotSocrataRow[],
    specFields: CotSpeculatorFields,
  ): CotHistoryRecord[] {
    const detailByDate = new Map(
      detailRows.map((row) => [this.toReportDate(row[COT_REPORT_DATE_FIELD]), row]),
    );

    const records: CotHistoryRecord[] = [];

    for (const legacyRow of legacyRows) {
      const reportDate = this.toReportDate(legacyRow[COT_REPORT_DATE_FIELD]);
      const detailRow = detailByDate.get(reportDate);

      if (reportDate.length === 0 || !detailRow) {
        continue;
      }

      records.push({
        contract_code: code,
        report_date: reportDate,
        mode,
        open_interest: this.toNumber(legacyRow[COT_LEGACY_HISTORY_FIELDS.openInterest]),
        spec_long: this.toNumber(detailRow[specFields.long]),
        spec_short: this.toNumber(detailRow[specFields.short]),
        noncomm_long: this.toNumber(legacyRow[COT_LEGACY_HISTORY_FIELDS.noncommLong]),
        noncomm_short: this.toNumber(legacyRow[COT_LEGACY_HISTORY_FIELDS.noncommShort]),
        comm_long: this.toNumber(legacyRow[COT_LEGACY_HISTORY_FIELDS.commLong]),
        comm_short: this.toNumber(legacyRow[COT_LEGACY_HISTORY_FIELDS.commShort]),
        nonrept_long: this.toNumber(legacyRow[COT_LEGACY_HISTORY_FIELDS.nonreptLong]),
        nonrept_short: this.toNumber(legacyRow[COT_LEGACY_HISTORY_FIELDS.nonreptShort]),
      });
    }

    return records;
  }

  static toHistory(
    market: CotMarketDTO,
    mode: CotReportMode,
    speculatorLabel: string,
    records: CotHistoryRecord[],
  ): CotHistoryDTO {
    const points = records.map((record) => this.toPoint(record));

    return {
      market,
      mode,
      speculatorLabel,
      points,
      indexes: COT_INDEX_WINDOWS.map((weeks) => this.toIndexWindow(points, weeks)),
      fetchedAt: new Date().toISOString(),
    };
  }

  private static toPoint(record: CotHistoryRecord): CotHistoryPointDTO {
    return {
      reportDate: record.report_date,
      openInterest: record.open_interest,
      specLong: record.spec_long,
      specShort: record.spec_short,
      specNet: record.spec_long - record.spec_short,
      nonCommercialLong: record.noncomm_long,
      nonCommercialShort: record.noncomm_short,
      nonCommercialNet: record.noncomm_long - record.noncomm_short,
      commercialLong: record.comm_long,
      commercialShort: record.comm_short,
      commercialNet: record.comm_long - record.comm_short,
      nonReportableLong: record.nonrept_long,
      nonReportableShort: record.nonrept_short,
      nonReportableNet: record.nonrept_long - record.nonrept_short,
    };
  }

  /**
   * Where the latest net position sits inside its own range over the lookback,
   * which is what makes "extreme" mean something comparable across markets.
   */
  private static toIndexWindow(points: CotHistoryPointDTO[], weeks: number): CotIndexWindowDTO {
    const window = points.slice(-weeks);

    if (window.length === 0) {
      return { weeks, sampleWeeks: 0, value: null, min: 0, max: 0 };
    }

    const nets = window.map((point) => point.specNet);
    const min = Math.min(...nets);
    const max = Math.max(...nets);
    const current = nets[nets.length - 1] ?? 0;

    return {
      weeks,
      sampleWeeks: window.length,
      value: max === min ? null : ((current - min) / (max - min)) * 100,
      min,
      max,
    };
  }

  /** Socrata returns full timestamps; the table stores calendar dates. */
  private static toReportDate(raw: string | undefined): string {
    return (raw ?? '').slice(0, 10);
  }

  private static toNumber(raw: string | undefined): number {
    if (raw === undefined) {
      return 0;
    }

    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  }
}
