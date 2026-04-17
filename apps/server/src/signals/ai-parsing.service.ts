import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import { SignalDTO, signalDtoSchema } from '@tradepilot/shared';
import { canonicalizeSignalSymbol } from '@tradepilot/trading';

const aiResponseSchema = z.object({
  action: z.enum(['OPEN', 'PARTIAL_CLOSE', 'CLOSE_ALL', 'MOVE_SL']),
  symbol: z.string().min(1),
  type: z.enum(['BUY', 'SELL']).nullable(),
  entry: z.enum(['MARKET', 'LIMIT']).nullable(),
  entry_price: z.number().nullable(),
  stop_loss: z.number().nullable(),
  take_profits: z.array(z.number()),
  close_percent: z.number().nullable(),
  new_stop_loss: z.number().nullable(),
});

const OPENAI_SIGNAL_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'action',
    'symbol',
    'type',
    'entry',
    'entry_price',
    'stop_loss',
    'take_profits',
    'close_percent',
    'new_stop_loss',
  ],
  properties: {
    action: {
      type: 'string',
      enum: ['OPEN', 'PARTIAL_CLOSE', 'CLOSE_ALL', 'MOVE_SL'],
    },
    symbol: {
      type: 'string',
    },
    type: {
      type: ['string', 'null'],
      enum: ['BUY', 'SELL', null],
    },
    entry: {
      type: ['string', 'null'],
      enum: ['MARKET', 'LIMIT', null],
    },
    entry_price: {
      type: ['number', 'null'],
    },
    stop_loss: {
      type: ['number', 'null'],
    },
    take_profits: {
      type: 'array',
      items: {
        type: 'number',
      },
    },
    close_percent: {
      type: ['number', 'null'],
    },
    new_stop_loss: {
      type: ['number', 'null'],
    },
  },
} as const;

const SYSTEM_PROMPT = [
  'Extract a trading instruction from the message.',
  'Return strict JSON only. No markdown. No commentary.',
  'Supported actions:',
  '- OPEN',
  '- PARTIAL_CLOSE',
  '- CLOSE_ALL',
  '- MOVE_SL',
  'Normalization rules:',
  '- GOLD and XAU mean XAUUSD.',
  '- US30 may also appear as DJ30 or DOW.',
  '- NAS100 may also appear as US100 or NASDAQ.',
  'Behavior rules:',
  '- Detect percentages like 25%, 50%, half, secure partial profit as PARTIAL_CLOSE.',
  '- Detect close all / exit all instructions as CLOSE_ALL.',
  '- Detect move SL, move stop, breakeven, break even, BE as MOVE_SL.',
  '- Support English, French, and Arabic slang.',
  '- If the message is a fresh trade entry, return OPEN.',
  '- For MARKET orders, entry is MARKET and entry_price is null when no numeric entry is present.',
  '- For LIMIT orders, entry is LIMIT and entry_price must be numeric.',
  '- For PARTIAL_CLOSE, only close_percent should be set from 1 to 100.',
  '- For CLOSE_ALL, type, entry, prices, and stop values can be null.',
  '- For MOVE_SL, set new_stop_loss when a specific value is provided; if the message says breakeven/BE and includes entry price, use that entry price as new_stop_loss.',
  '- Ignore emojis, hype, and non-instructional chat.',
].join('\n');

@Injectable()
export class AiParsingService {
  private readonly logger = new Logger(AiParsingService.name);

  constructor(private readonly configService: ConfigService) {}

  async parseSignal(rawMessage: string, sourceChannel?: string): Promise<SignalDTO> {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.configService.getOrThrow<string>('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.configService.get<string>('LLM_MODEL') ?? 'gpt-5.2',
        temperature: this.configService.get<number>('LLM_TEMPERATURE') ?? 0.1,
        max_output_tokens: 350,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: SYSTEM_PROMPT,
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: sourceChannel
                  ? `Channel: ${sourceChannel}\nMessage: ${rawMessage}`
                  : `Message: ${rawMessage}`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'trade_signal',
            strict: true,
            schema: OPENAI_SIGNAL_JSON_SCHEMA,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await this.tryReadJson(response);
      const message =
        this.readErrorMessage(errorBody) ??
        `OpenAI parsing request failed with status ${response.status}`;
      throw new InternalServerErrorException(message);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const outputText = this.extractOutputText(payload);

    if (!outputText) {
      this.logger.warn(`OpenAI response did not include text output: ${JSON.stringify(payload)}`);
      throw new Error('OpenAI did not return a structured signal payload');
    }

    const parsed = aiResponseSchema.parse(JSON.parse(outputText));

    return signalDtoSchema.parse({
      action: parsed.action,
      symbol: canonicalizeSignalSymbol(parsed.symbol),
      type: parsed.type,
      entry: parsed.entry,
      entryPrice: parsed.entry_price,
      stopLoss: parsed.stop_loss,
      takeProfits: parsed.take_profits.filter((value) => Number.isFinite(value) && value > 0),
      closePercent: parsed.close_percent,
      newStopLoss: parsed.new_stop_loss,
      sourceChannel,
      confidence: 0.84,
      parser: 'OPENAI',
    });
  }

  private extractOutputText(payload: Record<string, unknown>) {
    const directOutput = payload.output_text;

    if (typeof directOutput === 'string' && directOutput.trim().length > 0) {
      return directOutput.trim();
    }

    const output = Array.isArray(payload.output) ? payload.output : [];

    for (const item of output) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      const content = Array.isArray((item as { content?: unknown[] }).content)
        ? (item as { content: Array<Record<string, unknown>> }).content
        : [];

      for (const part of content) {
        if (part.type === 'output_text' && typeof part.text === 'string') {
          return part.text.trim();
        }

        if (part.type === 'refusal' && typeof part.refusal === 'string') {
          throw new Error(part.refusal);
        }
      }
    }

    return null;
  }

  private async tryReadJson(response: Response) {
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private readErrorMessage(payload: Record<string, unknown> | null) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const error = payload.error;

    if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
      return (error as { message: string }).message;
    }

    return null;
  }
}
