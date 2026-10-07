import { TradeExecutionDTO } from '@tradepilot/shared';

export interface TradePageQuery {
  page: number;
  pageSize: number;
  status?: TradeExecutionDTO['status'];
  symbol?: string;
  accountId?: string;
}
