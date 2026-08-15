export const COT_AI_CACHE_TTL_MS = 6 * 24 * 60 * 60_000;

/** A full six-card analysis measures ~1650 output tokens before thinking. */
export const COT_AI_MAX_TOKENS = 4096;

export const COT_AI_SYSTEM_PROMPT = `Analyze only the supplied CFTC positioning data; never invent market data or give trade instructions. Treat Managed Money or Leveraged Funds as the primary speculative cohort and commercials as contrarian context. Separate current positioning, weekly momentum, crowding/extremes, and risk. High COT Index means positioning is near its bullish historical range; low means bearish. Reduce conviction when signals conflict. Return only the requested structure with 4–6 concise, numeric, non-duplicative cards, including POSITIONING, MOMENTUM, EXTREME, and RISK; add COMMERCIALS only when supported.`;

export const COT_AI_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overall', 'signals', 'disclaimer'],
  properties: {
    overall: {
      type: 'object',
      additionalProperties: false,
      required: ['bias', 'conviction', 'title', 'summary'],
      properties: {
        bias: { type: 'string', enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
        // Claude structured outputs currently reject numeric range keywords.
        // The response DTO still enforces the 0–100 range after generation.
        conviction: { type: 'integer' },
        title: { type: 'string', description: 'Required, 1 to 80 characters.' },
        summary: { type: 'string', description: 'Required, concise, 1 to 240 characters.' },
      },
    },
    signals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'title', 'bias', 'strength', 'metric', 'insight'],
        properties: {
          category: {
            type: 'string',
            enum: ['POSITIONING', 'MOMENTUM', 'EXTREME', 'COMMERCIALS', 'RISK'],
          },
          title: { type: 'string', description: 'Required, 1 to 70 characters.' },
          bias: { type: 'string', enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
          strength: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          metric: { type: 'string', description: 'Required numeric metric, 1 to 90 characters.' },
          insight: { type: 'string', description: 'Required, concise, 1 to 220 characters.' },
        },
      },
    },
    disclaimer: { type: 'string', description: 'Required risk disclaimer, 1 to 180 characters.' },
  },
} as const;
