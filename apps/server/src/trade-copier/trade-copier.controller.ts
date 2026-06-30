import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';

import {
  AnonymousFollowerJoinInput,
  CreateCopierProgramInput,
  UpdateCopierProgramInput,
  anonymousFollowerJoinSchema,
  createCopierProgramSchema,
  updateCopierProgramSchema,
} from '@tradepilot/shared';

import { RequestUser } from '../auth/types/request-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import { TradeCopierService } from './trade-copier.service';

@Controller('trade-copier')
export class TradeCopierController {
  constructor(private readonly tradeCopierService: TradeCopierService) {}

  @UseGuards(JwtAuthGuard)
  @Get('programs')
  listPrograms(@CurrentUser() user: RequestUser) {
    return this.tradeCopierService.listPrograms(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('programs')
  createProgram(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createCopierProgramSchema)) body: CreateCopierProgramInput,
  ) {
    return this.tradeCopierService.createProgram(user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Put('programs/:programId')
  updateProgram(
    @CurrentUser() user: RequestUser,
    @Param('programId') programId: string,
    @Body(new ZodValidationPipe(updateCopierProgramSchema)) body: UpdateCopierProgramInput,
  ) {
    return this.tradeCopierService.updateProgram(user.userId, programId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('programs/:programId/invite-code/rotate')
  rotateInviteCode(@CurrentUser() user: RequestUser, @Param('programId') programId: string) {
    return this.tradeCopierService.rotateInviteCode(user.userId, programId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('programs/:programId/followers')
  listFollowers(@CurrentUser() user: RequestUser, @Param('programId') programId: string) {
    return this.tradeCopierService.listFollowers(user.userId, programId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('programs/:programId/followers/:deviceId/approve')
  approveFollower(
    @CurrentUser() user: RequestUser,
    @Param('programId') programId: string,
    @Param('deviceId') deviceId: string,
  ) {
    return this.tradeCopierService.approveFollower(user.userId, programId, deviceId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('programs/:programId/followers/:deviceId/revoke')
  revokeFollower(
    @CurrentUser() user: RequestUser,
    @Param('programId') programId: string,
    @Param('deviceId') deviceId: string,
  ) {
    return this.tradeCopierService.revokeFollower(user.userId, programId, deviceId);
  }

  @Post('followers/join')
  joinAsAnonymousFollower(
    @Body(new ZodValidationPipe(anonymousFollowerJoinSchema)) body: AnonymousFollowerJoinInput,
  ) {
    return this.tradeCopierService.joinWithInviteCode(body);
  }
}
