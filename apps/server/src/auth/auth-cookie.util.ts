interface CookieCarrier {
  headers?: { cookie?: string; 'x-forwarded-proto'?: string };
  secure?: boolean;
}

export const AUTH_COOKIE_NAME = 'app_auth_token';
export const AUTH_REFRESH_COOKIE_NAME = 'app_refresh_token';

export function readCookie(header: string | undefined, name = AUTH_COOKIE_NAME): string | undefined {
  if (!header) return undefined;
  return header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function readRefreshCookie(header: string | undefined): string | undefined {
  return readCookie(header, AUTH_REFRESH_COOKIE_NAME);
}

function decodeJwtExp(token: string): number | undefined {
  try {
    const [, payload] = token.split('.');
    if (!payload) return undefined;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const parsed = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as { exp?: unknown };
    return typeof parsed.exp === 'number' ? parsed.exp : undefined;
  } catch {
    return undefined;
  }
}

function isSecureRequest(request?: CookieCarrier): boolean {
  return Boolean(request?.secure || request?.headers?.['x-forwarded-proto'] === 'https');
}

export function buildAuthCookie(token: string, request?: CookieCarrier): string {
  const exp = decodeJwtExp(token);
  const maxAge = exp ? Math.max(exp - Math.floor(Date.now() / 1000), 0) : 60 * 60;
  const secure = isSecureRequest(request);
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function buildRefreshCookie(refreshToken: string, request?: CookieCarrier): string {
  const secure = isSecureRequest(request);
  const maxAge = 60 * 60 * 24 * 30;
  return `${AUTH_REFRESH_COOKIE_NAME}=${encodeURIComponent(refreshToken)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function buildAuthCookies(
  token: string,
  refreshToken: string | undefined,
  request?: CookieCarrier,
): string[] {
  return refreshToken
    ? [buildAuthCookie(token, request), buildRefreshCookie(refreshToken, request)]
    : [buildAuthCookie(token, request)];
}

export function buildClearAuthCookie(request?: CookieCarrier): string {
  const secure = isSecureRequest(request);
  return `${AUTH_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function buildClearAuthCookies(request?: CookieCarrier): string[] {
  const secure = isSecureRequest(request);
  return [
    buildClearAuthCookie(request),
    `${AUTH_REFRESH_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure ? '; Secure' : ''}`,
  ];
}
