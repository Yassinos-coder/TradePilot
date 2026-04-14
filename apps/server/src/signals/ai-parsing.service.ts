import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import { SignalDTO, signalDtoSchema } from '@tradepilot/shared';

const aiResponseSchema = z.object({
  symbol: z.string().min(1),
  type: z.enum(['BUY', 'SELL']),
  entry: z.enum(['MARKET', 'LIMIT']),
  entry_price: z.number().nullable(),
  stop_loss: z.number().positive(),
  take_profits: z.array(z.number().positive()).min(1),
});

const OPENAI_SIGNAL_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['symbol', 'type', 'entry', 'entry_price', 'stop_loss', 'take_profits'],
  properties: {
    symbol: {
      type: 'string',
    },
    type: {
      type: 'string',
      enum: ['BUY', 'SELL'],
    },
    entry: {
      type: 'string',
      enum: ['MARKET', 'LIMIT'],
    },
    entry_price: {
      type: ['number', 'null'],
    },
    stop_loss: {
      type: 'number',
    },
    take_profits: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'number',
      },
    },
  },
} as const;

const SYSTEM_PROMPT = [
  'Extract a trading signal from the message.',
  'Return strict JSON only. No markdown. No commentary.',
  'Rules:',
  '- Normalize GOLD and XAU to XAUUSD.',
  '- If the message says BUY NOW or SELL NOW, use "entry": "MARKET" and "entry_price": null.',
  '- If an explicit entry price is present, use "entry": "LIMIT" and "entry_price": that price.',
  '- stop_loss must be numeric.',
  '- take_profits must be an array of one or more numbers.',
  '- Ignore celebratory updates, chat noise, and messages that are not actual fresh trading signals.',
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
        max_output_tokens: 300,
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
    const symbol = this.normalizeSymbol(parsed.symbol);
    const entryPrice = parsed.entry === 'LIMIT' ? parsed.entry_price : null;

    if (parsed.entry === 'LIMIT' && entryPrice === null) {
      throw new Error('OpenAI returned a LIMIT order without an entry price');
    }

    return signalDtoSchema.parse({
      symbol,
      type: parsed.type,
      entry: parsed.entry,
      entryPrice,
      stopLoss: parsed.stop_loss,
      takeProfits: parsed.take_profits,
      sourceChannel,
      confidence: 0.82,
      parser: 'OPENAI',
    });
  }

  private normalizeSymbol(symbol: string) {
    const normalized = symbol.trim().toUpperCase();

    if (normalized === 'GOLD' || normalized === 'XAU') {
      return 'XAUUSD';
    }

    return normalized;
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
