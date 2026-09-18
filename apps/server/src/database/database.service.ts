import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private retentionTimer?: NodeJS.Timeout;
  private compacting = false;
  private readonly logger = new Logger(DatabaseService.name);
  private readonly supabaseClient: SupabaseClient<any, any, any>;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.getOrThrow<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.getOrThrow<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    const schema = this.configService.get<string>('SUPABASE_SCHEMA') ?? 'tradepilot';

    this.supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      db: { schema },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    this.logger.log(`Supabase client initialized for schema "${schema}"`);
  }

  onModuleInit() {
    void this.compactAccountHistory();
    this.retentionTimer = setInterval(() => void this.compactAccountHistory(), 60_000);
    this.retentionTimer.unref();
  }

  onModuleDestroy() {
    if (this.retentionTimer) clearInterval(this.retentionTimer);
  }

  private async compactAccountHistory() {
    if (this.compacting) return;
    this.compacting = true;
    try {
      const { error } = await this.supabaseClient.rpc('compact_account_status_history', { p_limit: 2000 });
      if (error) this.logger.warn(`Account history retention failed: ${error.message}`);
    } catch (error) {
      this.logger.warn(`Account history retention failed: ${String(error)}`);
    } finally {
      this.compacting = false;
    }
  }

  getClient(): SupabaseClient<any, any, any> {
    return this.supabaseClient;
  }

  /** Session-changing auth calls must not mutate the shared database client. */
  createAuthClient(): SupabaseClient {
    return createClient(
      this.configService.getOrThrow<string>('SUPABASE_URL'),
      this.configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
    );
  }

  async ping(): Promise<boolean> {
    try {
      const { error } = await this.supabaseClient.from('users').select('id').limit(1);
      return !error;
    } catch (error) {
      this.logger.warn(`Supabase health check failed: ${String(error)}`);
      return false;
    }
  }
}
