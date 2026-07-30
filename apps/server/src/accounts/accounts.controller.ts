import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CreateAccountInput, createAccountSchema } from '@tradepilot/shared';

import { RequestUser } from '../auth/types/request-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import { CopierLinksService } from '../copier/services/copier-links.service';

import { AccountsService } from './accounts.service';

@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly copierLinksService: CopierLinksService,
  ) {}

  @Get('status')
  getLatestAccountStatus(
    @CurrentUser() user: RequestUser,
    @Query('accountId') accountId?: string,
  ) {
    return this.accountsService.getLatestAccountStatus(user.userId, accountId);
  }

  @Get('status/history')
  getAccountStatusHistory(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.accountsService.listAccountStatusHistory(
      user.userId,
      Number(limit ?? 50),
      accountId,
    );
  }

  @Get()
  listAccounts(
    @CurrentUser() user: RequestUser,
    @Query('includeHidden') includeHidden?: string,
  ) {
    return this.accountsService.listAccounts(user.userId, includeHidden === 'true');
  }

  @Post()
  createAccount(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createAccountSchema)) body: CreateAccountInput,
  ) {
    return this.accountsService.createAccount(user.userId, body);
  }

  @Delete(':id')
  @HttpCode(204)
  deleteAccount(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.accountsService.deleteAccount(user.userId, id);
  }

  @Post(':id/hide')
  hideAccount(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.accountsService.hideAccount(user.userId, id);
  }

  /** Promotes this account to MASTER, demoting whichever account held the role. */
  @Post(':id/promote-master')
  async promoteToMaster(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.copierLinksService.setMasterAccount(user.userId, id);
    return this.accountsService.listAccounts(user.userId);
  }

  @Delete(':id/records')
  @HttpCode(204)
  deleteAccountRecords(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.accountsService.deleteAccountRecords(user.userId, id);
  }
}
