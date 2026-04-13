import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class DatabaseService {
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

  getClient(): SupabaseClient<any, any, any> {
    return this.supabaseClient;
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
