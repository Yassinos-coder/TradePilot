import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { DEFAULT_TELEGRAM_CHANNELS } from '@tradepilot/config';
import {
  SimulateTelegramSignalInput,
  TelegramChannelDTO,
  telegramChannelSchema,
} from '@tradepilot/shared';

import { DatabaseService } from '../database/database.service';
import { TelegramChannelRecord } from '../database/database.types';
import { SignalsService } from '../signals/signals.service';

@Injectable()
export class TelegramService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly signalsService: SignalsService,
  ) {}

  async listChannels(userId: string): Promise<TelegramChannelDTO[]> {
    const channels = await this.ensureChannels(userId);
    return channels.map((channel) => this.toChannelDto(channel));
  }

  async toggleChannel(userId: string, channelId: string): Promise<TelegramChannelDTO> {
    await this.ensureChannels(userId);

    const { data: existingChannel, error: channelError } = await this.databaseService
      .getClient()
      .from('telegram_channels')
      .select('*')
      .eq('id', channelId)
      .eq('user_id', userId)
      .maybeSingle();

    if (channelError) {
      throw new InternalServerErrorException(channelError.message);
    }

    if (!existingChannel) {
      throw new NotFoundException('Telegram channel was not found');
    }

    const { data: updatedChannel, error: updateError } = await this.databaseService
      .getClient()
      .from('telegram_channels')
      .update({ enabled: !existingChannel.enabled })
      .eq('id', channelId)
      .select('*')
      .single();

    if (updateError || !updatedChannel) {
      throw new InternalServerErrorException(
        updateError?.message ?? 'Failed to update Telegram channel',
      );
    }

    return this.toChannelDto(updatedChannel as TelegramChannelRecord);
  }

  async simulateIncomingSignal(userId: string, payload: SimulateTelegramSignalInput) {
    const { data: channel, error } = await this.databaseService
      .getClient()
      .from('telegram_channels')
      .select('*')
      .eq('id', payload.channelId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!channel) {
      throw new NotFoundException('Telegram channel was not found');
    }

    if (!channel.enabled) {
      throw new BadRequestException('Enable the channel before simulating messages');
    }

    const signal = await this.signalsService.ingestRawSignal(
      userId,
      payload.rawMessage,
      channel.name,
    );

    return {
      queued: true,
      signal,
    };
  }

  private async ensureChannels(userId: string): Promise<TelegramChannelRecord[]> {
    const client = this.databaseService.getClient();
    const { data: existingChannels, error } = await client
      .from('telegram_channels')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if ((existingChannels ?? []).length > 0) {
      return (existingChannels ?? []) as TelegramChannelRecord[];
    }

    const { error: insertError } = await client.from('telegram_channels').insert(
      DEFAULT_TELEGRAM_CHANNELS.map((channel) => ({
        user_id: userId,
        external_id: channel.externalId,
        name: channel.name,
        enabled: false,
      })),
    );

    if (insertError) {
      throw new InternalServerErrorException(insertError.message);
    }

    const { data: channels, error: refetchError } = await client
      .from('telegram_channels')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (refetchError) {
      throw new InternalServerErrorException(refetchError.message);
    }

    return (channels ?? []) as TelegramChannelRecord[];
  }

  private toChannelDto(channel: TelegramChannelRecord): TelegramChannelDTO {
    return telegramChannelSchema.parse({
      id: channel.id,
      name: channel.name,
      enabled: channel.enabled,
    });
  }
}
