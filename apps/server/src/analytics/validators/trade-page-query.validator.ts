import { TradeExecutionDTO } from '@tradepilot/shared';

import { TradePageQuery } from '../interfaces/trade-page-query.interface';

export class TradePageQueryValidator {
  private static readonly DEFAULT_PAGE_SIZE = 10;
  private static readonly MAX_PAGE_SIZE = 50;
  private static readonly STATUSES: ReadonlyArray<TradeExecutionDTO['status']> = ['OPEN', 'CLOSED', 'REJECTED'];

  static parse(raw: {
    page?: string;
    pageSize?: string;
    status?: string;
    symbol?: string;
    accountId?: string;
  }): TradePageQuery {
    const page = Number(raw.page);
    const pageSize = Number(raw.pageSize);
    return {
      page: Number.isInteger(page) && page > 0 ? page : 1,
      pageSize:
        Number.isInteger(pageSize) && pageSize > 0
          ? Math.min(pageSize, this.MAX_PAGE_SIZE)
          : this.DEFAULT_PAGE_SIZE,
      status: this.STATUSES.find((status) => status === raw.status),
      symbol: raw.symbol || undefined,
      accountId: raw.accountId || undefined,
    };
  }
}
