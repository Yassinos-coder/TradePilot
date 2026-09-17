import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import { AnalyticsService } from '../../analytics/services/analytics.service';
import { CotAiService } from './cot-ai.service';

async function main() {
  const config = new ConfigService({ NVIDIA_API_KEY: 'test-key', NVIDIA_MODEL: 'test-model' });
  const keys: string[] = [];
  const cache = { remember: async (key: string, _ttl: number, generate: () => Promise<unknown>) => {
    keys.push(key);
    return generate();
  } };
  const report = { market: { code: '088691', name: 'Gold' }, mode: 'futures', reportDate: '2026-09-08', tables: [] };
  const cot = new CotAiService(config, cache as never,
    { getReport: async () => report } as never,
    { getHistory: async () => ({ points: [], indexes: [] }) } as never);
  const coach = new AnalyticsService({} as never, {} as never, config, cache as never);
  coach.getAnalytics = async () => ({ totalTrades: 10, netProfit: 100, bySymbol: [] }) as never;
  const analysis = {
    overall: { bias: 'NEUTRAL', conviction: 30, title: 'Mixed positioning', summary: 'Limited data.' },
    signals: ['POSITIONING', 'MOMENTUM', 'EXTREME', 'RISK'].map(category => ({
      category, title: 'Limited data', bias: 'NEUTRAL', strength: 'LOW', metric: '0 observations', insight: 'Insufficient history.',
    })),
    disclaimer: 'Positioning does not predict price.',
  };
  const originalFetch = globalThis.fetch;
  let status = 200;
  let finishReason = 'stop';
  let content = JSON.stringify(analysis);
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://integrate.api.nvidia.com/v1/chat/completions');
    assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer test-key');
    const payload = JSON.parse(String(options?.body));
    assert.equal(payload.model, 'test-model');
    assert.equal(payload.messages[0].role, 'system');
    assert.equal(payload.chat_template_kwargs.enable_thinking, false);
    assert.equal(payload.output_config, undefined);
    return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finishReason }] }), { status });
  };
  try {
    assert.equal((await cot.analyze('088691', 'futures')).model, 'test-model');
    content = 'Five concise coaching sentences.';
    assert.equal(await coach.getAiAnalysis('user'), content);
    assert.ok(keys.every(key => key.includes(':nvidia:test-model:')));
    for (const run of [() => cot.analyze('088691', 'futures'), () => coach.getAiAnalysis('user')]) {
      for (const code of [401, 429, 503]) {
        status = code;
        await assert.rejects(run, code === 401 ? /NVIDIA_API_KEY/ : /temporarily unavailable/);
      }
      status = 200;
      finishReason = 'length';
      await assert.rejects(run, /incomplete/);
      finishReason = 'stop';
      content = '';
      await assert.rejects(run, /returned no/);
      content = 'invalid JSON';
    }
    await assert.rejects(() => cot.analyze('088691', 'futures'), /invalid COT/);
    content = '{}';
    await assert.rejects(() => cot.analyze('088691', 'futures'), /invalid COT/);
    globalThis.fetch = async () => { throw new Error('network unavailable'); };
    await assert.rejects(() => cot.analyze('088691', 'futures'), /temporarily unavailable/);
    await assert.rejects(() => coach.getAiAnalysis('user'), /temporarily unavailable/);
    console.log('NVIDIA analytics and COT response/error checks passed');
  } finally {
    globalThis.fetch = originalFetch;
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
