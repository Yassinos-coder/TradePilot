import assert from 'node:assert/strict';
import { AnalyticsService } from './analytics.service';

async function main() {
  const rows = [
    { account_id: 'live', balance: 149.65, equity: 154.55, starting_balance: 200 },
    { account_id: 'hidden', balance: 1000, equity: 1000, starting_balance: 1000 },
  ];
  const query: any = { select: () => query, eq: () => query, order: () => query,
    range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }) };
  const database = { getClient: () => ({ from: () => query }) };
  const cache = { remember: async () => ({ startingBalance: 200, currentBalance: 199.65, currentEquity: 214.25 }) };
  const service = new AnalyticsService(database as never, {} as never, {} as never, cache as never);
  (service as any).listHiddenAccountIds = async () => ['hidden'];
  const result = await service.getAnalytics('user');
  assert.equal(result.currentBalance, 149.65);
  assert.equal(result.currentEquity, 154.55);
  assert.equal(result.floatingPl, 4.9);
  assert.equal(result.accountGrowthPercent, -25.17);
  assert.equal(result.endingBalance, 149.65);
  console.log('Live balance bypasses stale analytics cache and excludes hidden accounts');
}
void main();
