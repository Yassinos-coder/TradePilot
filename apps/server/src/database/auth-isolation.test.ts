import assert from 'node:assert/strict';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { DatabaseService } from './database.service';

async function main() {
  const originalFetch = globalThis.fetch;
  const serviceKey = 'sb_secret_test_backend_key';
  const userToken = 'test-user-access-token';
  const requests: Array<{ url: string; authorization: string | null }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    requests.push({ url, authorization: headers.get('authorization') });
    if (url.includes('/auth/v1/token')) {
      return new Response(JSON.stringify({
        access_token: userToken, refresh_token: 'next-refresh-token', token_type: 'bearer',
        expires_in: 3600, user: { id: 'user-1', email: 'test@example.com' },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    assert.equal(headers.get('apikey'), serviceKey);
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const database = new DatabaseService(new ConfigService({
      SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    }));
    const auth = new AuthService(database, {} as never, {} as never);
    const session = await auth.refreshSession('browser-refresh-token');
    assert.equal(session.accessToken, userToken);
    await database.getClient().from('ea_account_current_status').select('account_id');
    await database.createAuthClient().auth.signInWithPassword({ email: 'test@example.com', password: 'test' });
    await database.getClient().rpc('record_account_status', {});
    const databaseRequests = requests.filter(request => request.url.includes('/rest/v1/'));
    assert.equal(databaseRequests.length, 2);
    assert.ok(databaseRequests.every(request => request.authorization !== `Bearer ${userToken}`));
    assert.equal((await database.getClient().auth.getSession()).data.session, null);
    assert.notEqual(database.createAuthClient(), database.createAuthClient());
    console.log('Browser refresh and password verification preserve database service authorization');
  } finally {
    globalThis.fetch = originalFetch;
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
