import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { AccountDTO, CreateAccountInput, accountDtoSchema } from '@tradepilot/shared';

import { DatabaseService } from '../database/database.service';
import { AccountRecord } from '../database/database.types';

@Injectable()
export class AccountsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async listAccounts(userId: string): Promise<AccountDTO[]> {
    const { data: accounts, error } = await this.databaseService
      .getClient()
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (accounts ?? []).map((account) => this.toAccountDto(account as AccountRecord));
  }

  async createAccount(userId: string, payload: CreateAccountInput): Promise<AccountDTO> {
    const { data: account, error } = await this.databaseService
      .getClient()
      .from('accounts')
      .insert({
        user_id: userId,
        name: payload.name,
        broker: payload.broker,
      })
      .select('*')
      .single();

    if (error || !account) {
      throw new InternalServerErrorException(error?.message ?? 'Failed to create account');
    }

    return this.toAccountDto(account as AccountRecord);
  }

  async deleteAccount(userId: string, accountId: string): Promise<void> {
    const { error } = await this.databaseService
      .getClient()
      .from('accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', userId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private toAccountDto(account: AccountRecord): AccountDTO {
    return accountDtoSchema.parse({
      id: account.id,
      name: account.name,
      broker: account.broker,
      createdAt: account.created_at,
    });
  }
}
