import { Injectable, InternalServerErrorException } from '@nestjs/common';

import { CotReportMode } from '@tradepilot/shared';

import { DatabaseService } from '../../database/database.service';
import { COT_UPSERT_CHUNK_SIZE } from '../constants/cot-history';
import { CotHistoryRecord } from '../interfaces';

@Injectable()
export class CotHistoryRepository {
  private readonly tableName = 'cot_history';

  constructor(private readonly databaseService: DatabaseService) {}

  async getLatestReportDate(code: string, mode: CotReportMode): Promise<string | null> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .select('report_date')
      .eq('contract_code', code)
      .eq('mode', mode)
      .order('report_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(`Failed to read COT history cursor: ${error.message}`);
    }

    return (data as { report_date: string } | null)?.report_date ?? null;
  }

  async listRecent(code: string, mode: CotReportMode, limit: number): Promise<CotHistoryRecord[]> {
    const { data, error } = await this.databaseService
      .getClient()
      .from(this.tableName)
      .select('*')
      .eq('contract_code', code)
      .eq('mode', mode)
      .order('report_date', { ascending: false })
      .limit(limit);

    if (error) {
      throw new InternalServerErrorException(`Failed to read COT history: ${error.message}`);
    }

    // Read newest-first so the limit keeps the most recent weeks, then flip to
    // chronological order, which is what charts and the index window expect.
    return ((data ?? []) as CotHistoryRecord[]).reverse();
  }

  async upsertMany(records: CotHistoryRecord[]): Promise<void> {
    for (let start = 0; start < records.length; start += COT_UPSERT_CHUNK_SIZE) {
      const chunk = records.slice(start, start + COT_UPSERT_CHUNK_SIZE);

      const { error } = await this.databaseService
        .getClient()
        .from(this.tableName)
        .upsert(chunk, { onConflict: 'contract_code,mode,report_date' });

      if (error) {
        throw new InternalServerErrorException(`Failed to store COT history: ${error.message}`);
      }
    }
  }
}
