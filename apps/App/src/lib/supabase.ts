import { createClient } from '@supabase/supabase-js';

import { parseClientEnv } from '@tradepilot/config';

export const supabaseEnv = parseClientEnv(import.meta.env as Record<string, unknown>);

export const supabase = createClient(
  supabaseEnv.VITE_SUPABASE_URL,
  supabaseEnv.VITE_SUPABASE_ANON_KEY,
  {
    db: {
      schema: 'tradepilot',
    },
    auth: {
      autoRefreshToken: true,
      persistSession: false,
      detectSessionInUrl: true,
    },
  },
);
