/**
 * Probability of hitting a losing streak of at least `streakLength` consecutive
 * losses somewhere within `trades` independent trials, given `winRatePercent`.
 *
 * Modeled as a Markov chain over the current run length (0..streakLength-1);
 * probability mass that would advance past streakLength-1 on a loss is
 * absorbed (the streak was hit), so 1 - remaining mass is the answer.
 */
export function probabilityOfLosingStreak(
  trades: number,
  streakLength: number,
  winRatePercent: number,
): number {
  if (streakLength <= 0) return 100;
  if (streakLength > trades) return 0;

  const winProb = Math.min(100, Math.max(0, winRatePercent)) / 100;
  const lossProb = 1 - winProb;

  let dp = new Array<number>(streakLength).fill(0);
  dp[0] = 1;

  for (let t = 0; t < trades; t++) {
    const next = new Array<number>(streakLength).fill(0);
    const total = dp.reduce((sum, value) => sum + value, 0);
    next[0] = total * winProb;
    for (let run = 1; run < streakLength; run++) {
      next[run] = (dp[run - 1] ?? 0) * lossProb;
    }
    dp = next;
  }

  const survived = dp.reduce((sum, value) => sum + value, 0);
  return Math.min(100, Math.max(0, (1 - survived) * 100));
}
