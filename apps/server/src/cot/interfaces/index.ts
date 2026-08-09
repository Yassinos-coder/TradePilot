import { CotTableKind } from '@tradepilot/shared';

export type CotFeedKey = CotTableKind;

/** One market's row from a CFTC comma-delimited release, fields already split. */
export interface CotFeedRow {
  name: string;
  code: string;
  exchange: string;
  reportDate: string;
  fields: string[];
}

export interface CotCategoryLayout {
  key: string;
  label: string;
  /** Index of the long column inside a positions/changes/percent block. */
  long: number;
  short: number;
  spreading: number | null;
  /** False for nonreportables, which the traders block leaves out entirely. */
  hasTraders: boolean;
}

/**
 * Column geometry of one feed. Every block is a fixed-width run of numbers at a
 * known offset, so a category is addressed by `offset + index` in all of them.
 */
export interface CotFeedLayout {
  positionsOffset: number;
  changesOffset: number;
  percentOffset: number;
  tradersOffset: number;
  categories: CotCategoryLayout[];
  /** The category whose net position the page leads with. */
  speculatorKey: string;
}

export interface CotSpeculatorFields {
  long: string;
  short: string;
}

/** A Socrata row: every value arrives as a string, including the numbers. */
export type CotSocrataRow = Record<string, string | undefined>;

/** One weekly row of `tradepilot.cot_history`, in database column casing. */
export interface CotHistoryRecord {
  contract_code: string;
  report_date: string;
  mode: string;
  open_interest: number;
  spec_long: number;
  spec_short: number;
  noncomm_long: number;
  noncomm_short: number;
  comm_long: number;
  comm_short: number;
  nonrept_long: number;
  nonrept_short: number;
}

export interface CotBackfillSummary {
  markets: number;
  weeks: number;
  /** `code/mode` pairs that failed, so one bad market cannot abort the sweep. */
  failures: string[];
}

export interface CotMarketDefinition {
  code: string;
  label: string;
  group: string;
  exchange: string;
  contractUnit: string;
  symbol: string | null;
  /** The second taxonomy this market is published under, alongside legacy. */
  detail: Extract<CotFeedKey, 'disaggregated' | 'financial'>;
}
