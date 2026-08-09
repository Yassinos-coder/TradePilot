import { CotReportMode } from '@tradepilot/shared';

import { CotFeedKey, CotFeedLayout } from '../interfaces';

const BASE_URL = 'https://www.cftc.gov/dea/newcot';

/**
 * The comma-delimited releases carry every market of a report in one file, so
 * three requests cover all three taxonomies for the whole watchlist.
 */
export const COT_FEED_URLS: Record<CotFeedKey, Record<CotReportMode, string>> = {
  legacy: {
    futures: `${BASE_URL}/deafut.txt`,
    combined: `${BASE_URL}/deacom.txt`,
  },
  disaggregated: {
    futures: `${BASE_URL}/f_disagg.txt`,
    combined: `${BASE_URL}/c_disagg.txt`,
  },
  financial: {
    futures: `${BASE_URL}/FinFutWk.txt`,
    combined: `${BASE_URL}/FinComWk.txt`,
  },
};

/** Field 8 onward is data; everything before it is market identity. */
const DATA_OFFSET = 7;

export const COT_FEED_LAYOUTS: Record<CotFeedKey, CotFeedLayout> = {
  legacy: {
    positionsOffset: DATA_OFFSET,
    changesOffset: 37,
    percentOffset: 47,
    tradersOffset: 77,
    speculatorKey: 'non_commercial',
    categories: [
      { key: 'non_commercial', label: 'Non-Commercial', long: 1, short: 2, spreading: 3, hasTraders: true },
      { key: 'commercial', label: 'Commercial', long: 4, short: 5, spreading: null, hasTraders: true },
      { key: 'total', label: 'Total', long: 6, short: 7, spreading: null, hasTraders: true },
      { key: 'non_reportable', label: 'Non-Reportable', long: 8, short: 9, spreading: null, hasTraders: false },
    ],
  },
  disaggregated: {
    positionsOffset: DATA_OFFSET,
    changesOffset: 55,
    percentOffset: 71,
    tradersOffset: 119,
    speculatorKey: 'managed_money',
    categories: [
      {
        key: 'producer_merchant',
        label: 'Producer/Merchant/Processor/User',
        long: 1,
        short: 2,
        spreading: null,
        hasTraders: true,
      },
      { key: 'swap_dealers', label: 'Swap Dealers', long: 3, short: 4, spreading: 5, hasTraders: true },
      { key: 'managed_money', label: 'Managed Money', long: 6, short: 7, spreading: 8, hasTraders: true },
      { key: 'other_reportables', label: 'Other Reportables', long: 9, short: 10, spreading: 11, hasTraders: true },
      {
        key: 'non_reportable',
        label: 'Nonreportable Positions',
        long: 14,
        short: 15,
        spreading: null,
        hasTraders: false,
      },
    ],
  },
  financial: {
    positionsOffset: DATA_OFFSET,
    changesOffset: 24,
    percentOffset: 41,
    tradersOffset: 58,
    speculatorKey: 'leveraged_funds',
    categories: [
      { key: 'dealer', label: 'Dealer/Intermediary', long: 1, short: 2, spreading: 3, hasTraders: true },
      {
        key: 'asset_manager',
        label: 'Asset Manager/Institutional',
        long: 4,
        short: 5,
        spreading: 6,
        hasTraders: true,
      },
      { key: 'leveraged_funds', label: 'Leveraged Funds', long: 7, short: 8, spreading: 9, hasTraders: true },
      { key: 'other_reportables', label: 'Other Reportables', long: 10, short: 11, spreading: 12, hasTraders: true },
      {
        key: 'non_reportable',
        label: 'Nonreportable Positions',
        long: 15,
        short: 16,
        spreading: null,
        hasTraders: false,
      },
    ],
  },
};

export const COT_TABLE_LABELS: Record<CotFeedKey, string> = {
  legacy: 'Legacy',
  disaggregated: 'Disaggregated',
  financial: 'Traders in Financial Futures',
};
