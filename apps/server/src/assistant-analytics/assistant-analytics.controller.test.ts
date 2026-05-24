import assert from 'node:assert/strict';

import { UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';

import { AssistantAnalyticsController } from './assistant-analytics.controller';

type Call = { method: string; userId: string; accountId?: string; limit?: number };

class ConfigStub {
  constructor(private readonly values: Record<string, string | undefined>) {}

  get<T = string>(key: string): T | undefined {
    return this.values[key] as T | undefined;
  }
}

class ExecutionStub {
  readonly calls: Call[] = [];

  async getAnalytics(userId: string, accountId?: string) {
    this.calls.push({ method: 'getAnalytics', userId, accountId });
    return {
      totalTrades: 12,
      winRate: 58.33,
      netProfit: 321.5,
      bySymbol: [{ symbol: 'XAUUSD', trades: 4, netProfit: 120 }],
    };
  }

  async listRecentTrades(userId: string, limit = 10, accountId?: string) {
    this.calls.push({ method: 'listRecentTrades', userId, accountId, limit });
    return [{ id: 'trade-1', symbol: 'XAUUSD', profit: 42 }];
  }

  async getLatestAccountStatus(userId: string, accountId?: string) {
    this.calls.push({ method: 'getLatestAccountStatus', userId, accountId });
    return { accountId: accountId ?? 'all', balance: 1000, equity: 1010 };
  }
}

async function main() {
  const execution = new ExecutionStub();
  const controller = new AssistantAnalyticsController(
    execution as never,
    new ConfigStub({
      TRADEPILOT_ANALYTICS_READ_TOKEN: 'secret-token',
      TRADEPILOT_ANALYTICS_USER_ID: 'user-123',
    }) as never,
  );

  const response = await controller.getReadOnlyAnalytics('secret-token', 'acct-1');

  assert.equal(response.schemaVersion, 'tradepilot.analytics.read.v1');
  assert.equal(response.readOnly, true);
  assert.equal(response.accountId, 'acct-1');
  assert.equal(response.analytics.totalTrades, 12);
  assert.equal(response.recentTrades.length, 1);
  assert.equal(response.latestAccountStatus?.balance, 1000);
  assert.match(response.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(execution.calls, [
    { method: 'getAnalytics', userId: 'user-123', accountId: 'acct-1' },
    { method: 'listRecentTrades', userId: 'user-123', accountId: 'acct-1', limit: 25 },
    { method: 'getLatestAccountStatus', userId: 'user-123', accountId: 'acct-1' },
  ]);

  await assert.rejects(
    () => controller.getReadOnlyAnalytics('bad-token'),
    UnauthorizedException,
  );

  const missingConfigController = new AssistantAnalyticsController(
    execution as never,
    new ConfigStub({ TRADEPILOT_ANALYTICS_READ_TOKEN: 'secret-token' }) as never,
  );
  await assert.rejects(
    () => missingConfigController.getReadOnlyAnalytics('secret-token'),
    ServiceUnavailableException,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
