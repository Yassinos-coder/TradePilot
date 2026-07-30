import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';

import {
  CreateApiKeyInput,
  RotateApiKeyInput,
  createApiKeySchema,
  rotateApiKeySchema,
} from '@tradepilot/shared';

import { RequestUser } from '../../auth/types/request-user.type';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApiKeysService } from '../services/api-keys.service';

@UseGuards(JwtAuthGuard)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  listKeys(@CurrentUser() user: RequestUser) {
    return this.apiKeysService.listKeys(user.userId);
  }

  @Post()
  createKey(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createApiKeySchema)) body: CreateApiKeyInput,
  ) {
    return this.apiKeysService.createKey(user.userId, body);
  }

  @Post(':keyId/rotate')
  rotateKey(
    @CurrentUser() user: RequestUser,
    @Param('keyId', ParseUUIDPipe) keyId: string,
    @Body(new ZodValidationPipe(rotateApiKeySchema)) body: RotateApiKeyInput,
  ) {
    return this.apiKeysService.rotateKey(user.userId, keyId, body);
  }

  @Delete(':keyId')
  async revokeKey(
    @CurrentUser() user: RequestUser,
    @Param('keyId', ParseUUIDPipe) keyId: string,
  ) {
    await this.apiKeysService.revokeKey(user.userId, keyId);
    return { success: true };
  }
}
