import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { EaGatewayService } from '../../ea/ea-gateway.service';
import { API_KEY_INVALIDATED_CHANNEL, ApiKeysService } from './api-keys.service';

async function main() {
  const records = new Map<string, any>();
  const add = (id: string, expires_at: string | null = null) => {
    const secret = `tp_ea_test_secret_${id}`;
    records.set(id, { id, user_id: 'owner', kind: 'EA', revoked_at: null, expires_at,
      key_hash: ApiKeysService.hashSecret(secret), scopes: [], hmac_secret: null });
    return secret;
  };
  const repo = {
    findById: async (userId: string, id: string) => records.get(id)?.user_id === userId ? records.get(id) : null,
    findLiveByHash: async (hash: string, kind: string) => [...records.values()].find(
      key => key.key_hash === hash && key.kind === kind && !key.revoked_at) ?? null,
    revoke: async (id: string) => { records.get(id).revoked_at = new Date().toISOString(); },
    delete: async (userId: string, id: string) => {
      assert.equal(records.get(id)?.user_id, userId); records.delete(id);
    },
    touchLastUsed: async () => {},
  };
  const handlers = new Map<string, (raw: string) => Promise<void>>();
  let publishFails = false;
  const redis = {
    subscribe: async (channel: string, handler: (raw: string) => Promise<void>) => {
      handlers.set(channel, handler); return async () => { handlers.delete(channel); };
    },
    publish: async (channel: string, raw: string) => {
      if (publishFails) throw new Error('test pub/sub outage');
      await handlers.get(channel)?.(raw);
    },
  };
  const config = new ConfigService({ EA_SERVER_PING_INTERVAL_MS: 60000, EA_HEARTBEAT_TIMEOUT_MS: 120000 });
  const keys = new ApiKeysService(repo as never, config, redis as never);
  const presence = new Map<string, unknown>();
  const gateway = new EaGatewayService(keys, config, redis as never, {} as never, {} as never,
    { emit: () => {} } as never,
    { set: async (_u: string, data: any) => { presence.set(data.accountId, data); },
      remove: async (_u: string, id: string) => { presence.delete(id); } } as never,
    {} as never, {} as never, {} as never);
  (gateway as any).upsertEaAccount = async () => {};
  const server = createServer();
  gateway.attach(server);
  await gateway.onModuleInit();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as { port: number };
  const sockets: WebSocket[] = [];
  const connect = async (secret: string, accountId: string, expected = 'auth_success') => {
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws/ea`);
    sockets.push(ws);
    await once(ws, 'open');
    const reply = once(ws, 'message');
    ws.send(JSON.stringify({ type: 'auth', apiKey: secret, accountId, accountName: accountId }));
    const [raw] = await reply;
    assert.equal(JSON.parse(raw.toString()).type, expected);
    return ws;
  };
  const closed = (ws: WebSocket) => once(ws, 'close', { signal: AbortSignal.timeout(5000) });
  try {
    const firstSecret = add('first');
    const secondSecret = add('second');
    const first = await connect(firstSecret, 'account-a');
    const firstOtherTerminal = await connect(firstSecret, 'account-a2');
    const second = await connect(secondSecret, 'account-b');
    await assert.rejects(() => keys.deleteKey('another-user', 'first'), /not found/);
    assert.equal(first.readyState, WebSocket.OPEN);
    let close = closed(first);
    const otherTerminalClosed = closed(firstOtherTerminal);
    await keys.revokeKey('owner', 'first');
    assert.equal((await close)[0], 1008);
    await otherTerminalClosed;
    assert.ok(!presence.has('account-a'));
    assert.ok(presence.has('account-b'));
    assert.equal(second.readyState, WebSocket.OPEN);
    await connect(firstSecret, 'rejected-revoked', 'error');
    await keys.deleteKey('owner', 'first');
    assert.ok(!records.has('first'));
    close = closed(second);
    await keys.deleteKey('owner', 'second');
    await close;
    await connect(secondSecret, 'rejected-deleted', 'error');

    const directSecret = add('direct');
    const direct = await connect(directSecret, 'account-c');
    records.delete('direct');
    close = closed(direct);
    await (gateway as any).revalidateSocketKeys();
    await close;

    const expiredSecret = add('expired');
    const expired = await connect(expiredSecret, 'account-d');
    records.get('expired').expires_at = new Date(Date.now() - 1000).toISOString();
    close = closed(expired);
    await (gateway as any).revalidateSocketKeys();
    await close;
    await connect(expiredSecret, 'rejected-expired', 'error');

    const fallbackSecret = add('fallback');
    const fallback = await connect(fallbackSecret, 'account-e');
    publishFails = true;
    await keys.revokeKey('owner', 'fallback');
    close = closed(fallback);
    fallback.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
    await close;
    publishFails = false;

    const other = await connect(add('other'), 'account-f');
    await handlers.get(API_KEY_INVALIDATED_CHANNEL)!(JSON.stringify({ userId: 'someone-else', keyId: 'other' }));
    assert.equal(other.readyState, WebSocket.OPEN);
    records.delete('other');
    close = closed(other);
    assert.equal(await gateway.dispatchProxyCommand('owner', 'account-f', { type: 'ping', timestamp: Date.now() }), false);
    await close;
    const restSecret = add('rest');
    records.get('rest').kind = 'REST';
    assert.ok(await keys.resolveKey(restSecret, 'REST'));
    await keys.revokeKey('owner', 'rest');
    assert.equal(await keys.resolveKey(restSecret, 'REST'), null);
    await keys.deleteKey('owner', 'rest');
    assert.equal(await keys.resolveKey(restSecret, 'REST'), null);
    console.log('EA key revocation, deletion, expiry, tenant isolation, pub/sub fallback, and reconnect rejection passed');
  } finally {
    sockets.forEach(socket => socket.terminate());
    gateway.onModuleDestroy();
    server.close();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
