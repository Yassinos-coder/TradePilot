import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import {
  DEFAULT_ALLOW_API_TRADE_OPENING,
  DEFAULT_AUTO_COPY_ENABLED,
  DEFAULT_COPIER_RISK_PARAMS,
  DEFAULT_EXCLUDED_SYMBOLS,
  DEFAULT_NOTIFICATION_CHANNELS,
  DEFAULT_NOTIFICATION_EVENTS,
  DEFAULT_SESSIONS,
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
        ...(payload.nickname === undefined ? {} : { nickname: payload.nickname }),
        ...(payload.country === undefined ? {} : { country: payload.country }),
        ...(payload.city === undefined ? {} : { city: payload.city }),
        ...(payload.street === undefined ? {} : { street: payload.street }),
        ...(payload.postalCode === undefined ? {} : { postal_code: payload.postalCode }),
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(error?.message ?? 'Failed to update profile');
    }

    return this.toUserDto(data as UserRecord);
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
      .createAuthClient()
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

  /**
   * Keyed on the Supabase session, which is the only full unique constraint on
   * this table. The device id rides along as data and the read side folds rows
   * by device, so the sessions list still shows one entry per browser.
   *
   * Do not switch this to (user_id, device_id): that index has to stay partial
   * to allow null device ids, and Postgres cannot infer a partial index for
   * ON CONFLICT, so the upsert fails with 42P10 on every authenticated request.
   */
  async upsertSession(input: {
    userId: string;
    authSessionId: string;
    deviceId: string | null;
    userAgent: string | null;
    ipAddress: string | null;
  }): Promise<void> {
    const row = {
      user_id: input.userId,
      auth_session_id: input.authSessionId,
      device_id: input.deviceId,
      user_agent: input.userAgent,
      ip_address: input.ipAddress,
      last_seen_at: new Date().toISOString(),
    };

    const { error } = await this.databaseService
      .getClient()
      .from('user_sessions')
      .upsert(row, { onConflict: 'user_id,auth_session_id' });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  async listSessions(userId: string, currentDeviceId?: string | null): Promise<UserSessionDTO[]> {
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

    return this.foldSessionsByDevice((data ?? []) as UserSessionRecord[]).map((session) =>
      sessionDtoSchema.parse({
        id: session.id,
        authSessionId: session.auth_session_id,
        deviceId: session.device_id,
        userAgent: session.user_agent,
        ipAddress: session.ip_address,
        sessionCount: session.sessionCount,
        isCurrentDevice: Boolean(
          currentDeviceId && session.device_id && session.device_id === currentDeviceId,
        ),
        lastSeenAt: session.last_seen_at,
        createdAt: session.created_at,
      }),
    );
  }

  /**
   * Collapses rows that represent the same physical device into one entry.
   *
   * Rows minted before device ids existed, or by clients that do not send one,
   * fall back to IP plus user agent. Records arrive newest-first, so the first
   * row seen in a group carries the latest activity; the rest only contribute
   * to the count and to the earliest-seen timestamp.
   */
  private foldSessionsByDevice(
    sessions: UserSessionRecord[],
  ): Array<UserSessionRecord & { sessionCount: number }> {
    const grouped = new Map<string, UserSessionRecord & { sessionCount: number }>();

    for (const session of sessions) {
      const key =
        session.device_id ?? `${session.ip_address ?? 'unknown'}::${session.user_agent ?? 'unknown'}`;
      const existing = grouped.get(key);

      if (!existing) {
        grouped.set(key, { ...session, sessionCount: 1 });
        continue;
      }

      existing.sessionCount += 1;

      if (new Date(session.created_at) < new Date(existing.created_at)) {
        existing.created_at = session.created_at;
      }
    }

    return [...grouped.values()];
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

  toUserDto(user: UserRecord): UserDTO {
    return userDtoSchema.parse({
      id: user.id,
      email: user.email,
      fullName: user.full_name ?? null,
      nickname: user.nickname ?? null,
      phoneNumber: user.phone_number ?? null,
      country: user.country ?? null,
      city: user.city ?? null,
      street: user.street ?? null,
      postalCode: user.postal_code ?? null,
      pendingEmail: user.pending_email ?? null,
      createdAt: user.created_at,
    });
  }

  private async ensureDefaultSettings(userId: string) {
    const { error } = await this.databaseService.getClient().from('settings').upsert(
      {
        user_id: userId,
        auto_copy_enabled: DEFAULT_AUTO_COPY_ENABLED,
        execution_paused: false,
        execution_pause_reason: null,
        execution_paused_at: null,
        allow_api_trade_opening: DEFAULT_ALLOW_API_TRADE_OPENING,
        excluded_symbols: DEFAULT_EXCLUDED_SYMBOLS,
        sessions: DEFAULT_SESSIONS,
        copier_defaults: DEFAULT_COPIER_RISK_PARAMS,
        notification_channels: DEFAULT_NOTIFICATION_CHANNELS,
        notification_events: DEFAULT_NOTIFICATION_EVENTS,
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
