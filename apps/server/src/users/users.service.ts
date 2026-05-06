import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import {
  DEFAULT_AUTO_COPY_ENABLED,
  DEFAULT_EXCLUDED_SYMBOLS,
  DEFAULT_EXECUTION_MODE,
  DEFAULT_LOW_MARGIN_THRESHOLD_PERCENT,
  DEFAULT_MAX_DAILY_LOSS_PERCENT,
  DEFAULT_MAX_SIMULTANEOUS_TRADES,
  DEFAULT_MAX_TRADES_PER_DAY,
  DEFAULT_SESSIONS,
  SUPPORTED_SYMBOLS,
} from '@tradepilot/config';
import {
  UpdateProfileInput,
  UserDTO,
  UserSessionDTO,
  sessionDtoSchema,
  userDtoSchema,
} from '@tradepilot/shared';

import { DatabaseService } from '../database/database.service';
import { UserRecord, UserSessionRecord } from '../database/database.types';

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

  async updateProfile(userId: string, payload: UpdateProfileInput): Promise<UserDTO> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('users')
      .update({
        full_name: payload.fullName,
        phone_number: payload.phoneNumber,
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(error?.message ?? 'Failed to update profile');
    }

    return this.toUserDto(data as UserRecord);
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

  async requestEmailChange(userId: string, newEmail: string) {
    const existing = await this.findByEmail(newEmail);
    if (existing && existing.id !== userId) {
      throw new BadRequestException('This email address is already in use');
    }

    const token = `emv_${randomBytes(24).toString('hex')}`;
    const requestedAt = new Date().toISOString();

    const { data, error } = await this.databaseService
      .getClient()
      .from('users')
      .update({
        pending_email: newEmail,
        pending_email_token: token,
        pending_email_requested_at: requestedAt,
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to register email change request',
      );
    }

    return {
      token,
      user: this.toUserDto(data as UserRecord),
    };
  }

  async verifyEmailChange(userId: string, token: string): Promise<UserDTO> {
    const user = await this.findById(userId);

    if (!user) {
      throw new NotFoundException('User profile was not found');
    }

    if (!user.pending_email || !user.pending_email_token) {
      throw new BadRequestException('There is no pending email change request');
    }

    if (user.pending_email_token !== token) {
      throw new UnauthorizedException('Invalid email verification token');
    }

    if (!user.auth_user_id) {
      throw new BadRequestException('Supabase auth user is missing for this account');
    }

    const { error: authError } = await this.databaseService
      .getClient()
      .auth.admin.updateUserById(user.auth_user_id, {
        email: user.pending_email,
      });

    if (authError) {
      throw new InternalServerErrorException(authError.message);
    }

    const { data, error } = await this.databaseService
      .getClient()
      .from('users')
      .update({
        email: user.pending_email,
        pending_email: null,
        pending_email_token: null,
        pending_email_requested_at: null,
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to finalize email change',
      );
    }

    return this.toUserDto(data as UserRecord);
  }

  async changePassword(
    user: Pick<UserRecord, 'email' | 'auth_user_id'>,
    currentPassword: string,
    nextPassword: string,
  ): Promise<void> {
    const { error: signInError } = await this.databaseService
      .getClient()
      .auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

    if (signInError) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (!user.auth_user_id) {
      throw new BadRequestException('Supabase auth user is missing for this account');
    }

    const { error } = await this.databaseService
      .getClient()
      .auth.admin.updateUserById(user.auth_user_id, {
        password: nextPassword,
      });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async upsertSession(
    userId: string,
    authSessionId: string,
    userAgent: string | null,
    ipAddress: string | null,
  ): Promise<void> {
    const { error } = await this.databaseService
      .getClient()
      .from('user_sessions')
      .upsert(
        {
          user_id: userId,
          auth_session_id: authSessionId,
          user_agent: userAgent,
          ip_address: ipAddress,
          last_seen_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,auth_session_id',
        },
      );

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async listSessions(userId: string): Promise<UserSessionDTO[]> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('last_seen_at', { ascending: false })
      .limit(100);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return ((data ?? []) as UserSessionRecord[]).map((session) =>
      sessionDtoSchema.parse({
        id: session.id,
        authSessionId: session.auth_session_id,
        userAgent: session.user_agent,
        ipAddress: session.ip_address,
        lastSeenAt: session.last_seen_at,
        createdAt: session.created_at,
      }),
    );
  }

  async clearSessions(userId: string): Promise<void> {
    const { error } = await this.databaseService
      .getClient()
      .from('user_sessions')
      .delete()
      .eq('user_id', userId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async logoutAllDevices(userId: string, accessToken: string): Promise<void> {
    const { error } = await this.databaseService
      .getClient()
      .auth.admin.signOut(accessToken, 'global');

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    await this.clearSessions(userId);
  }

  toUserDto(
    user: Pick<
      UserRecord,
      | 'id'
      | 'email'
      | 'api_key'
      | 'full_name'
      | 'phone_number'
      | 'pending_email'
      | 'created_at'
    >,
  ): UserDTO {
    return userDtoSchema.parse({
      id: user.id,
      email: user.email,
      fullName: user.full_name ?? null,
      phoneNumber: user.phone_number ?? null,
      pendingEmail: user.pending_email ?? null,
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
        max_simultaneous_trades: DEFAULT_MAX_SIMULTANEOUS_TRADES,
        max_daily_loss_percent: DEFAULT_MAX_DAILY_LOSS_PERCENT,
        max_trades_per_day: DEFAULT_MAX_TRADES_PER_DAY,
        low_margin_threshold_percent: DEFAULT_LOW_MARGIN_THRESHOLD_PERCENT,
        auto_copy_enabled: DEFAULT_AUTO_COPY_ENABLED,
        execution_paused: false,
        execution_pause_reason: null,
        execution_paused_at: null,
        allowed_symbols: SUPPORTED_SYMBOLS,
        excluded_symbols: DEFAULT_EXCLUDED_SYMBOLS,
        sessions: DEFAULT_SESSIONS,
        mode: DEFAULT_EXECUTION_MODE,
        notification_channels: {
          email: true,
          telegram: true,
          whatsapp: false,
        },
        notification_events: {
          newTradeOpened: true,
          tpHit: true,
          slHit: true,
          lowMargin: true,
          eaDisconnected: true,
          telegramDisconnected: true,
          executionFailed: true,
          dailySummary: false,
        },
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
