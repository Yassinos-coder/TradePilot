import { createHash } from 'node:crypto';

export function normalizeRawMessage(rawMessage: string) {
  return rawMessage.replace(/\s+/g, ' ').trim().toUpperCase();
}

export function hashText(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
