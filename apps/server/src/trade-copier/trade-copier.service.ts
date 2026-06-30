import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import {
  AnonymousFollowerJoinInput,
  AnonymousFollowerJoinResult,
  CopierProgramDTO,
  CreateCopierProgramInput,
  FollowerDeviceDTO,
  UpdateCopierProgramInput,
  anonymousFollowerJoinResultSchema,
} from '@tradepilot/shared';

import { DatabaseService } from '../database/database.service';
import {
  CopierInviteCodeRecord,
  CopierProgramRecord,
  FollowerDeviceRecord,
} from '../database/database.types';

import { toCopierProgramDto, toFollowerDeviceDto } from './mappers/trade-copier.mapper';
import {
  buildJoinCode,
  createFollowerDeviceToken,
  hashSecret,
  maskAccountLogin,
  normalizeJoinCode,
  validateFollowerTokenBinding,
} from './utils/trade-copier.security';

const FOLLOWER_ONLINE_WINDOW_MS = 60_000;

@Injectable()
export class TradeCopierService {
  constructor(private readonly databaseService: DatabaseService) {}

  async listPrograms(providerUserId: string): Promise<CopierProgramDTO[]> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('copier_programs')
      .select('*')
      .eq('provider_user_id', providerUserId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const programs = (data ?? []) as CopierProgramRecord[];
    return Promise.all(programs.map((program) => this.hydrateProgram(program)));
  }

  async createProgram(providerUserId: string, input: CreateCopierProgramInput): Promise<CopierProgramDTO> {
    const { data: programData, error: programError } = await this.databaseService
      .getClient()
      .from('copier_programs')
      .insert({
        provider_user_id: providerUserId,
        name: input.name,
        description: input.description ?? null,
        status: 'ACTIVE',
        max_follower_devices: input.maxFollowerDevices,
        requires_approval: input.requiresApproval,
      })
      .select('*')
      .single();

    if (programError || !programData) {
      throw new InternalServerErrorException(programError?.message ?? 'Failed to create copier program');
    }

    const program = programData as CopierProgramRecord;
    const invite = await this.createInviteCode(program.id, program.name);
    return this.hydrateProgram(program, invite);
  }

  async updateProgram(
    providerUserId: string,
    programId: string,
    input: UpdateCopierProgramInput,
  ): Promise<CopierProgramDTO> {
    await this.assertProgramOwner(providerUserId, programId);

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.status !== undefined) patch.status = input.status;
    if (input.maxFollowerDevices !== undefined) patch.max_follower_devices = input.maxFollowerDevices;
    if (input.requiresApproval !== undefined) patch.requires_approval = input.requiresApproval;

    if (Object.keys(patch).length === 0) {
      const program = await this.getProgramRecord(programId);
      return this.hydrateProgram(program);
    }

    const { data, error } = await this.databaseService
      .getClient()
      .from('copier_programs')
      .update(patch)
      .eq('id', programId)
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(error?.message ?? 'Failed to update copier program');
    }

    return this.hydrateProgram(data as CopierProgramRecord);
  }

  async rotateInviteCode(providerUserId: string, programId: string): Promise<CopierProgramDTO> {
    const program = await this.assertProgramOwner(providerUserId, programId);

    const { error } = await this.databaseService
      .getClient()
      .from('copier_invite_codes')
      .update({ active: false })
      .eq('program_id', programId)
      .eq('active', true);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const invite = await this.createInviteCode(programId, program.name);
    return this.hydrateProgram(program, invite);
  }

  async listFollowers(providerUserId: string, programId: string): Promise<FollowerDeviceDTO[]> {
    await this.assertProgramOwner(providerUserId, programId);

    const { data, error } = await this.databaseService
      .getClient()
      .from('follower_devices')
      .select('*')
      .eq('program_id', programId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return ((data ?? []) as FollowerDeviceRecord[]).map(toFollowerDeviceDto);
  }

  async approveFollower(providerUserId: string, programId: string, deviceId: string): Promise<FollowerDeviceDTO> {
    return this.updateFollowerStatus(providerUserId, programId, deviceId, 'ACTIVE');
  }

  async revokeFollower(providerUserId: string, programId: string, deviceId: string): Promise<FollowerDeviceDTO> {
    return this.updateFollowerStatus(providerUserId, programId, deviceId, 'REVOKED');
  }

  async authenticateFollowerDevice(input: {
    deviceId: string;
    token: string;
    accountLoginHash: string;
    terminalFingerprintHash: string;
  }): Promise<FollowerDeviceRecord | null> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('follower_devices')
      .select('*')
      .eq('id', input.deviceId)
      .eq('token_hash', hashSecret(input.token))
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const device = data as FollowerDeviceRecord;
    if (device.status !== 'ACTIVE') {
      return null;
    }

    const matchesBinding = validateFollowerTokenBinding(
      {
        accountLoginHash: device.account_login_hash,
        brokerServer: device.broker_server ?? '',
        terminalFingerprintHash: device.terminal_fingerprint_hash,
      },
      {
        accountLoginHash: input.accountLoginHash,
        brokerServer: device.broker_server ?? '',
        terminalFingerprintHash: input.terminalFingerprintHash,
      },
    );

    if (!matchesBinding) {
      return null;
    }

    await this.touchFollowerDevice(device.id);
    return device;
  }

  async touchFollowerDevice(deviceId: string): Promise<void> {
    await this.databaseService
      .getClient()
      .from('follower_devices')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', deviceId);
  }

  async listActiveProgramIdsForProvider(providerUserId: string): Promise<string[]> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('copier_programs')
      .select('id')
      .eq('provider_user_id', providerUserId)
      .eq('status', 'ACTIVE');

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((row) => String((row as { id: string }).id));
  }

  async joinWithInviteCode(input: AnonymousFollowerJoinInput): Promise<AnonymousFollowerJoinResult> {
    const code = normalizeJoinCode(input.inviteCode);
    const invite = await this.findActiveInviteCode(code);
    const program = await this.getProgramRecord(invite.program_id);

    if (program.status !== 'ACTIVE') {
      throw new ForbiddenException('This copier program is not accepting followers');
    }

    const followerCount = await this.countFollowers(program.id);
    if (followerCount >= program.max_follower_devices) {
      throw new ConflictException('This copier program reached its follower device limit');
    }

    const status = program.requires_approval ? 'PENDING_APPROVAL' : 'ACTIVE';
    const token = createFollowerDeviceToken();
    const { data, error } = await this.databaseService
      .getClient()
      .from('follower_devices')
      .insert({
        program_id: program.id,
        nickname: input.nickname ?? null,
        token_hash: hashSecret(token),
        account_login_hash: input.accountLoginHash,
        account_login_masked: maskAccountLogin(input.accountLoginHash),
        broker_server: input.brokerServer,
        platform: input.platform,
        terminal_fingerprint_hash: input.terminalFingerprintHash,
        status,
        last_seen_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(error?.message ?? 'Failed to register follower device');
    }

    return anonymousFollowerJoinResultSchema.parse({
      deviceId: (data as FollowerDeviceRecord).id,
      programId: program.id,
      providerName: program.name,
      status,
      token,
    });
  }

  private async updateFollowerStatus(
    providerUserId: string,
    programId: string,
    deviceId: string,
    status: 'ACTIVE' | 'REVOKED',
  ) {
    await this.assertProgramOwner(providerUserId, programId);

    const { data, error } = await this.databaseService
      .getClient()
      .from('follower_devices')
      .update({ status })
      .eq('id', deviceId)
      .eq('program_id', programId)
      .select('*')
      .single();

    if (error || !data) {
      throw new NotFoundException('Follower device was not found');
    }

    return toFollowerDeviceDto(data as FollowerDeviceRecord);
  }

  private async hydrateProgram(
    program: CopierProgramRecord,
    activeInviteCode?: CopierInviteCodeRecord | null,
  ): Promise<CopierProgramDTO> {
    const [invite, followerCount, onlineFollowerCount] = await Promise.all([
      activeInviteCode === undefined ? this.findActiveInviteCodeByProgram(program.id) : activeInviteCode,
      this.countFollowers(program.id),
      this.countOnlineFollowers(program.id),
    ]);

    return toCopierProgramDto(program, { activeInviteCode: invite, followerCount, onlineFollowerCount });
  }

  private async assertProgramOwner(providerUserId: string, programId: string) {
    const program = await this.getProgramRecord(programId);
    if (program.provider_user_id !== providerUserId) {
      throw new NotFoundException('Copier program was not found');
    }
    return program;
  }

  private async getProgramRecord(programId: string) {
    const { data, error } = await this.databaseService
      .getClient()
      .from('copier_programs')
      .select('*')
      .eq('id', programId)
      .single();

    if (error || !data) {
      throw new NotFoundException('Copier program was not found');
    }

    return data as CopierProgramRecord;
  }

  private async findActiveInviteCode(code: string) {
    const { data, error } = await this.databaseService
      .getClient()
      .from('copier_invite_codes')
      .select('*')
      .eq('code', code)
      .eq('active', true)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      throw new BadRequestException('Invite code is invalid or inactive');
    }

    const invite = data as CopierInviteCodeRecord;
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      throw new BadRequestException('Invite code has expired');
    }

    return invite;
  }

  private async findActiveInviteCodeByProgram(programId: string) {
    const { data, error } = await this.databaseService
      .getClient()
      .from('copier_invite_codes')
      .select('*')
      .eq('program_id', programId)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data as CopierInviteCodeRecord | null) ?? null;
  }

  private async createInviteCode(programId: string, programName: string) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = buildJoinCode(programName);
      const { data, error } = await this.databaseService
        .getClient()
        .from('copier_invite_codes')
        .insert({ program_id: programId, code, active: true, expires_at: null })
        .select('*')
        .single();

      if (!error && data) {
        return data as CopierInviteCodeRecord;
      }

      if (!String(error?.message ?? '').toLowerCase().includes('duplicate')) {
        throw new InternalServerErrorException(error?.message ?? 'Failed to create invite code');
      }
    }

    throw new InternalServerErrorException('Failed to create a unique invite code');
  }

  private async countFollowers(programId: string) {
    const { count, error } = await this.databaseService
      .getClient()
      .from('follower_devices')
      .select('id', { count: 'exact', head: true })
      .eq('program_id', programId)
      .neq('status', 'REVOKED');

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return count ?? 0;
  }

  private async countOnlineFollowers(programId: string) {
    const onlineSince = new Date(Date.now() - FOLLOWER_ONLINE_WINDOW_MS).toISOString();
    const { count, error } = await this.databaseService
      .getClient()
      .from('follower_devices')
      .select('id', { count: 'exact', head: true })
      .eq('program_id', programId)
      .eq('status', 'ACTIVE')
      .gte('last_seen_at', onlineSince);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return count ?? 0;
  }
}
