import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserDTO } from '@tradepilot/shared';

import { DatabaseService } from '../database/database.service';
import { UsersService } from '../users/users.service';
import { RequestUser } from './types/request-user.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly usersService: UsersService,
  ) {}

  async authenticateAccessToken(accessToken: string): Promise<RequestUser> {
    const { data, error } = await this.databaseService.getClient().auth.getUser(accessToken);

    if (error || !data.user || !data.user.email) {
      throw new UnauthorizedException('Invalid or expired Supabase session');
    }

    const user = await this.usersService.ensureAuthUser(data.user.id, data.user.email);

    return {
      userId: user.id,
      authUserId: data.user.id,
      email: user.email,
    };
  }

  async getCurrentUser(accessToken: string): Promise<UserDTO> {
    const requestUser = await this.authenticateAccessToken(accessToken);
    return this.usersService.getProfile(requestUser.userId);
  }

  async getCurrentUserFromRequest(user: RequestUser): Promise<UserDTO> {
    return this.usersService.getProfile(user.userId);
  }
}
