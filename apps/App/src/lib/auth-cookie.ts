import { api } from './api';

interface SupabaseSessionLike {
  access_token?: string;
  refresh_token?: string;
}

export async function syncAuthCookie(session: SupabaseSessionLike | null | undefined) {
  if (!session?.access_token) return;
  await api.post('/auth/session', {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  });
}

export async function clearAuthCookie() {
  await api.delete('/auth/session').catch(() => undefined);
}
