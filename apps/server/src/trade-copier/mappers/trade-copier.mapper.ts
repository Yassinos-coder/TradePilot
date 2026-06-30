import {
  CopierProgramDTO,
  FollowerDeviceDTO,
  copierProgramSchema,
  followerDeviceSchema,
} from '@tradepilot/shared';

import {
  CopierInviteCodeRecord,
  CopierProgramRecord,
  FollowerDeviceRecord,
} from '../../database/database.types';

export function toCopierProgramDto(
  program: CopierProgramRecord,
  options: {
    activeInviteCode?: CopierInviteCodeRecord | null;
    followerCount?: number;
    onlineFollowerCount?: number;
  } = {},
): CopierProgramDTO {
  return copierProgramSchema.parse({
    id: program.id,
    providerUserId: program.provider_user_id,
    name: program.name,
    description: program.description,
    status: program.status,
    maxFollowerDevices: program.max_follower_devices,
    requiresApproval: program.requires_approval,
    activeInviteCode: options.activeInviteCode?.code ?? null,
    followerCount: options.followerCount ?? 0,
    onlineFollowerCount: options.onlineFollowerCount ?? 0,
    createdAt: program.created_at,
    updatedAt: program.updated_at,
  });
}

export function toFollowerDeviceDto(device: FollowerDeviceRecord): FollowerDeviceDTO {
  return followerDeviceSchema.parse({
    id: device.id,
    programId: device.program_id,
    nickname: device.nickname,
    accountLoginMasked: device.account_login_masked,
    brokerServer: device.broker_server,
    platform: device.platform,
    status: device.status,
    lastSeenAt: device.last_seen_at,
    createdAt: device.created_at,
  });
}
