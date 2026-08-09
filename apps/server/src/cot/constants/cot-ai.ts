export const COT_AI_CACHE_TTL_MS = 6 * 24 * 60 * 60_000;

export const COT_AI_SYSTEM_PROMPT = `You are TradePilot's senior Commitments of Traders analyst. You interpret weekly CFTC positioning for active traders.

Analyze only the supplied data. Never invent prices, macro events, support/resistance, or missing history. COT data is slow-moving positioning context, not a standalone entry signal.

Your job:
- Decide whether each measurable factor is BULLISH, BEARISH, or NEUTRAL for the named market.
- Distinguish current positioning from weekly momentum and from crowding/extreme risk.
- Treat Managed Money or Leveraged Funds as the primary speculative cohort.
- Use commercial positioning as contextual/contrarian information, not an automatic signal.
- A high COT Index means net speculative positioning is near the bullish end of its own historical range; a low index means it is near the bearish end.
- Extreme one-sided positioning can support the trend while simultaneously increasing reversal or squeeze risk. State that tension clearly.
- Keep every card concise, numeric, direct, and understandable to a trader.
- Set overall conviction conservatively. Conflicting signals should reduce conviction.
- Do not provide trade instructions, entries, stops, targets, promises, or personalized financial advice.

Return only the requested structured data. Produce 4 to 6 non-duplicative signal cards. Include POSITIONING, MOMENTUM, EXTREME, and RISK; include COMMERCIALS when the input supports it.`;

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
        conviction: { type: 'integer', minimum: 0, maximum: 100 },
        title: { type: 'string', minLength: 1, maxLength: 80 },
        summary: { type: 'string', minLength: 1, maxLength: 240 },
      },
    },
    signals: {
      type: 'array',
      minItems: 4,
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'title', 'bias', 'strength', 'metric', 'insight'],
        properties: {
          category: {
            type: 'string',
            enum: ['POSITIONING', 'MOMENTUM', 'EXTREME', 'COMMERCIALS', 'RISK'],
          },
          title: { type: 'string', minLength: 1, maxLength: 70 },
          bias: { type: 'string', enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] },
          strength: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          metric: { type: 'string', minLength: 1, maxLength: 90 },
          insight: { type: 'string', minLength: 1, maxLength: 220 },
        },
      },
    },
    disclaimer: { type: 'string', minLength: 1, maxLength: 180 },
  },
} as const;
