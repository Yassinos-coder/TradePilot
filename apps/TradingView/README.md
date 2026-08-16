# Victor Gold Confluence Strategy

`victor_gold_confluence_strategy.pine` is a backtestable Pine Script v6 interpretation of the supplied interview. It is intended for a **5-minute XAUUSD chart**.

## Rules encoded

- 4-hour direction filter using the 200 EMA and 200 SMA.
- Confirmed 15-minute pivots identify the latest impulse.
- Pullbacks at 38.2, 50, 61.8, 71.4, 78.6, or 88.6 percent (78.6 by default).
- A configurable confluence score from higher-timeframe direction, 200 EMA/SMA proximity, prior key levels, and $100 psychological levels.
- Three consecutive 5-minute reaction candles at the Fibonacci zone.
- Limit entry on a pullback to the Fibonacci level.
- Stop beyond the three-candle reaction wick; setups outside the stated 20–40 pip range are rejected.
- 70% partial at the opposing structure target (with a 2R floor), plus a configurable 8R runner.
- Stop moves to break-even only after a candle body closes beyond the first 1R obstacle.

## Important interpretation notes

The interview is discretionary and does not provide programmable definitions for fundamentals, hand-drawn key levels, trend lines, liquidity, the precise impulse choice, or the next opposing zone. The script therefore uses objective proxies and exposes their thresholds as inputs. It does **not** claim to reproduce the trader's historical results.

TradingView cannot automatically backtest news/fundamental judgment. Use the long/short toggles to supply a manual fundamental bias when desired, and verify `Gold pip size` against the broker feed before evaluating risk settings.

To use it, open TradingView's Pine Editor, paste the `.pine` file, save it, and choose **Add to chart**.
