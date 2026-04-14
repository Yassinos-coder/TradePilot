import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';

import { CreateAccountInput, createAccountSchema } from '@tradepilot/shared';

import { RequestUser } from '../auth/types/request-user.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

import { AccountsService } from './accounts.service';

@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get('status')
  getLatestAccountStatus(@CurrentUser() user: RequestUser) {
    return this.accountsService.getLatestAccountStatus(user.userId);
  }

  @Get()
  listAccounts(@CurrentUser() user: RequestUser) {
    return this.accountsService.listAccounts(user.userId);
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
}
