import { CotReportMode } from '@tradepilot/shared';

import { CotFeedKey, CotSpeculatorFields } from '../interfaces';

export const COT_SOCRATA_BASE_URL = 'https://publicreporting.cftc.gov/resource';

/**
 * The disaggregated and TFF reports both begin 2006-06-13, and legacy is only
 * charted alongside them, so history starts there. Exclusive: the backfill
 * query filters on `report_date > cursor`, and this is the opening cursor.
 */
export const COT_HISTORY_START_EXCLUSIVE = '2006-06-12';

export const COT_HISTORY_DATASETS: Record<CotFeedKey, Record<CotReportMode, string>> = {
  legacy: { futures: '6dca-aqww', combined: 'jun7-fc8e' },
  disaggregated: { futures: '72hh-3qpy', combined: 'kh3c-gbw2' },
  financial: { futures: 'gpe5-46if', combined: 'yw9f-hn96' },
};

/** The TFF dataset drops the `_all` suffix the other two carry. */
export const COT_SPECULATOR_FIELDS: Record<'disaggregated' | 'financial', CotSpeculatorFields> = {
  disaggregated: {
    long: 'm_money_positions_long_all',
    short: 'm_money_positions_short_all',
  },
  financial: {
    long: 'lev_money_positions_long',
    short: 'lev_money_positions_short',
  },
};

export const COT_LEGACY_HISTORY_FIELDS = {
  openInterest: 'open_interest_all',
  noncommLong: 'noncomm_positions_long_all',
  noncommShort: 'noncomm_positions_short_all',
  commLong: 'comm_positions_long_all',
  commShort: 'comm_positions_short_all',
  nonreptLong: 'nonrept_positions_long_all',
  nonreptShort: 'nonrept_positions_short_all',
} as const;

export const COT_REPORT_DATE_FIELD = 'report_date_as_yyyy_mm_dd';

/** Comfortably above the ~1,050 weekly rows a contract has since 2006. */
export const COT_SOCRATA_PAGE_LIMIT = 5000;

/** Supabase rejects very large payloads, so upserts go up in slices. */
export const COT_UPSERT_CHUNK_SIZE = 500;

/**
 * The full archive, so the category chart can run from the first week on record
 * to the latest. ~1,050 weeks exist since 2006; this leaves room to 2030.
 */
export const COT_HISTORY_POINT_LIMIT = 1300;

export const COT_INDEX_WINDOWS = [26, 52, 156];
