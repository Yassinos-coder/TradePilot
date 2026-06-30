import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export interface FollowerTokenBinding {
  accountLoginHash: string;
  brokerServer: string;
  terminalFingerprintHash: string;
}

export type TokenBindingValidationResult =
  | { valid: true }
  | { valid: false; reason: 'ACCOUNT_LOGIN_MISMATCH' | 'BROKER_SERVER_MISMATCH' | 'TERMINAL_FINGERPRINT_MISMATCH' };

export function normalizeJoinCode(code: string) {
  return code.trim().toUpperCase();
}

export function buildJoinCode(programName: string) {
  const prefix = programName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .padEnd(3, 'X')
    .slice(0, 3);

  const first = randomBytes(3).toString('base64url').replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(4, '0').slice(0, 4);
  const second = randomBytes(3).toString('base64url').replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(4, '0').slice(0, 4);

  return `${prefix}-${first}-${second}`;
}

export function createFollowerDeviceToken() {
  return `tpfd_${randomBytes(32).toString('base64url')}`;
}

export function hashSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex');
}

export function secretsMatch(secret: string, expectedHash: string) {
  const incoming = Buffer.from(hashSecret(secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');

  if (incoming.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(incoming, expected);
}

export function maskAccountLogin(accountLogin: string | null | undefined) {
  if (!accountLogin) {
    return null;
  }

  if (accountLogin.length <= 4) {
    return '*'.repeat(accountLogin.length);
  }

  return `${'*'.repeat(Math.max(4, accountLogin.length - 4))}${accountLogin.slice(-4)}`;
}

export function validateFollowerTokenBinding(
  expected: FollowerTokenBinding,
  actual: FollowerTokenBinding,
): TokenBindingValidationResult {
  if (expected.accountLoginHash !== actual.accountLoginHash) {
    return { valid: false, reason: 'ACCOUNT_LOGIN_MISMATCH' };
  }

  if (expected.brokerServer !== actual.brokerServer) {
    return { valid: false, reason: 'BROKER_SERVER_MISMATCH' };
  }

  if (expected.terminalFingerprintHash !== actual.terminalFingerprintHash) {
    return { valid: false, reason: 'TERMINAL_FINGERPRINT_MISMATCH' };
  }

  return { valid: true };
}
