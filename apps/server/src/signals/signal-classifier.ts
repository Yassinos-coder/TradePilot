import { SignalClassification } from '@tradepilot/shared';

const SIGNAL_OPEN_KEYWORDS = [
  'BUY',
  'SELL',
  'LIMIT',
  'MARKET',
  'ENTRY',
  'OPEN',
  'LONG',
  'SHORT',
];

const MANAGEMENT_KEYWORDS = [
  'CLOSE',
  'PARTIAL',
  'BREAKEVEN',
  'BREAK EVEN',
  'MOVE SL',
  'STOP LOSS TO',
  'SECURE',
  'TP HIT',
  'SL HIT',
];

const NOISE_KEYWORDS = [
  'RESULT',
  'PROFIT',
  'STAT',
  'SCREENSHOT',
  'MOTIVATION',
  'PROMO',
  'ADVERTISEMENT',
  'WEEKLY',
  'MONTHLY',
];

function normalize(rawMessage: string) {
  return rawMessage
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function includesAny(content: string, keywords: string[]) {
  return keywords.some((keyword) => content.includes(keyword));
}

export function classifySignalMessage(rawMessage: string): SignalClassification {
  const content = normalize(rawMessage);

  const hasOpenSignal = includesAny(content, SIGNAL_OPEN_KEYWORDS);
  const hasManagement = includesAny(content, MANAGEMENT_KEYWORDS);
  const hasNoise = includesAny(content, NOISE_KEYWORDS);

  if (hasOpenSignal) {
    return 'SIGNAL';
  }

  if (hasManagement) {
    return 'MANAGEMENT';
  }

  if (hasNoise) {
    return 'NOISE';
  }

  return 'NOISE';
}
