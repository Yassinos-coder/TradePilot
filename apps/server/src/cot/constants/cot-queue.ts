export const COT_QUEUE_NAME = 'cot-backfill';

export const COT_BACKFILL_JOB_NAME = 'backfill-all-markets';

export const COT_BACKFILL_SCHEDULER_ID = 'cot-weekly-backfill';

/**
 * The CFTC publishes Friday at 15:30 New York time. This fires 45 minutes later,
 * which clears the release without drifting into the weekend, and the timezone
 * is pinned so the job does not slide an hour at daylight-saving boundaries.
 */
export const COT_BACKFILL_CRON = '0 15 16 * * 5';
export const COT_BACKFILL_TIMEZONE = 'America/New_York';

/** Keeps a few runs for inspection without letting the list grow forever. */
export const COT_BACKFILL_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 60_000 },
  removeOnComplete: 20,
  removeOnFail: 50,
} as const;
