import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { COPY_EVENT_FEED_LIMIT } from '@tradepilot/config';
import {
  CreateCopierLinkInput,
  SetMasterAccountInput,
  UpdateCopierLinkInput,
  createCopierLinkSchema,
  setMasterAccountSchema,
  updateCopierLinkSchema,
} from '@tradepilot/shared';

import { RequestUser } from '../../auth/types/request-user.type';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CopierLinksService } from '../services/copier-links.service';

@UseGuards(JwtAuthGuard)
@Controller('copier')
export class CopierController {
  constructor(private readonly copierLinksService: CopierLinksService) {}

  @Get('overview')
  getOverview(@CurrentUser() user: RequestUser) {
    return this.copierLinksService.getOverview(user.userId);
  }

  @Get('links')
  listLinks(@CurrentUser() user: RequestUser) {
    return this.copierLinksService.listLinks(user.userId);
  }

  @Get('events')
  listEvents(@CurrentUser() user: RequestUser, @Query('limit') limit?: string) {
    const parsed = Number(limit);
    const resolvedLimit =
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : COPY_EVENT_FEED_LIMIT;

    return this.copierLinksService.listCopyEvents(user.userId, resolvedLimit);
  }

  @Post('links')
  createLink(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createCopierLinkSchema)) body: CreateCopierLinkInput,
  ) {
    return this.copierLinksService.createLink(user.userId, body);
  }

  @Put('master')
  async setMaster(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(setMasterAccountSchema)) body: SetMasterAccountInput,
  ) {
    await this.copierLinksService.setMasterAccount(user.userId, body.accountId);
    return { success: true };
  }

  @Put('links/:linkId')
  updateLink(
    @CurrentUser() user: RequestUser,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Body(new ZodValidationPipe(updateCopierLinkSchema)) body: UpdateCopierLinkInput,
  ) {
    return this.copierLinksService.updateLink(user.userId, linkId, body);
  }

  @Delete('links/:linkId')
  async deleteLink(
    @CurrentUser() user: RequestUser,
    @Param('linkId', ParseUUIDPipe) linkId: string,
  ) {
    await this.copierLinksService.deleteLink(user.userId, linkId);
    return { success: true };
  }
}
