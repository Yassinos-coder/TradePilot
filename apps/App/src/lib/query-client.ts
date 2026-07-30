import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      // Supabase bills egress on the reads each poll triggers, so a background
      // tab must not keep polling.
      refetchIntervalInBackground: false,
      retry: 1,
    },
  },
});
