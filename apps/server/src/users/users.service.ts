import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import {
  DEFAULT_ALLOWED_SYMBOLS,
  DEFAULT_EXECUTION_MODE,
  DEFAULT_SESSIONS,
} from '@tradepilot/config';
import { UserDTO, userDtoSchema } from '@tradepilot/shared';

import { DatabaseService } from '../database/database.service';
import { UserRecord } from '../database/database.types';

@Injectable()
export class UsersService {
  constructor(private readonly databaseService: DatabaseService) {}

  async ensureAuthUser(authUserId: string, email: string): Promise<UserRecord> {
    const client = this.databaseService.getClient();
    const existingByAuthId = await this.findByAuthUserId(authUserId);

    if (existingByAuthId) {
      await this.ensureDefaultSettings(existingByAuthId.id);
      return existingByAuthId;
    }

    const existingByEmail = await this.findByEmail(email);

    if (existingByEmail && !existingByEmail.auth_user_id) {
      const { data: linkedUser, error: linkError } = await client
        .from('users')
        .update({
          auth_user_id: authUserId,
          email,
        })
        .eq('id', existingByEmail.id)
        .select('*')
        .single();

      if (linkError || !linkedUser) {
        throw new InternalServerErrorException(
          linkError?.message ?? 'Failed to link the existing account to Supabase auth',
        );
      }

      await this.ensureDefaultSettings(linkedUser.id);
      return linkedUser as UserRecord;
    }

    const { data: user, error } = await client
      .from('users')
      .insert({
        auth_user_id: authUserId,
        email,
        api_key: this.generateApiKey(),
      })
      .select('*')
      .single();

    if (error || !user) {
      throw new InternalServerErrorException(error?.message ?? 'Failed to create user');
    }

    await this.ensureDefaultSettings(user.id);

    return user as UserRecord;
  }

  async findByEmail(email: string) {
    const { data, error } = await this.databaseService
      .getClient()
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as UserRecord | null;
  }

  async findByAuthUserId(authUserId: string) {
    const { data, error } = await this.databaseService
      .getClient()
      .from('users')
      .select('*')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as UserRecord | null;
  }

  async findById(userId: string) {
    const { data, error } = await this.databaseService
      .getClient()
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as UserRecord | null;
  }

  async findByApiKey(apiKey: string) {
    const { data, error } = await this.databaseService
      .getClient()
      .from('users')
      .select('*')
      .eq('api_key', apiKey)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data as UserRecord | null;
  }

  async getProfile(userId: string): Promise<UserDTO> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User profile was not found');
    }

    return this.toUserDto(user);
  }

  async rotateApiKey(userId: string): Promise<UserDTO> {
    const { data: user, error } = await this.databaseService
      .getClient()
      .from('users')
      .update({ api_key: this.generateApiKey() })
      .eq('id', userId)
      .select('*')
      .single();

    if (error || !user) {
      throw new InternalServerErrorException(error?.message ?? 'Failed to rotate API key');
    }

    return this.toUserDto(user as UserRecord);
  }

  toUserDto(
    user: Pick<UserRecord, 'id' | 'email' | 'api_key' | 'created_at'>,
  ): UserDTO {
    return userDtoSchema.parse({
      id: user.id,
      email: user.email,
      apiKey: user.api_key,
      createdAt: user.created_at,
    });
  }

  private generateApiKey() {
    return `tp_${randomBytes(24).toString('hex')}`;
  }

  private async ensureDefaultSettings(userId: string) {
    const { error } = await this.databaseService.getClient().from('settings').upsert(
      {
        user_id: userId,
        risk_percent: 1,
        max_trades: 3,
        allowed_symbols: DEFAULT_ALLOWED_SYMBOLS,
        sessions: DEFAULT_SESSIONS,
        mode: DEFAULT_EXECUTION_MODE,
      },
      {
        onConflict: 'user_id',
        ignoreDuplicates: true,
      },
    );

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }
}
