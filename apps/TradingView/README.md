# TradePilot TradingView Scripts

## ATR Projection Levels Indicator

`TradePilot_ATR_Projection_Levels.pine` is a Pine Script **v6 indicator** that automates Yassine's weekly ATR projection workflow.

It anchors from the last confirmed weekly close, projects Fibonacci-style volatility levels (`-2`, `-1.5`, `-1`, `0`, `1`, `1.5`, `2`) using weekly ATR, and converts each level into an extended grey reaction zone whose height comes from the 4H ATR equilibrium of the last completed weekly window. Optional dashed daily ATR levels can be shown at the same time for volatility refresh during the week.

Key inputs:

- `Trend Detection`: `Auto` or `Manual`.
- `Manual Direction`: `Bullish` or `Bearish` when manual mode is selected.
- `ATR Length`: default `14`.
- `Zone Height`: `4H ATR Equilibrium` or `Weekly ATR`.
- `Show Daily Refreshed Levels`: overlays dashed daily levels from previous daily close + daily ATR.

If auto structure detects a ranging market, the indicator hides projection levels and shows a ranging status watermark/dashboard.

Install: open TradingView → Pine Editor → paste `TradePilot_ATR_Projection_Levels.pine` → **Add to chart**.

---

## ORB Strategy

`TradePilot_ORB_Strategy.pine` is a Pine Script **v6** port of the MT5 Expert Advisor
[`../Metatrader-eas/MT5/TradePilot_ORB_EA.mq5`](../Metatrader-eas/MT5/TradePilot_ORB_EA.mq5).

Same idea: mark the New York opening range (High/Low incl. wicks), wait for a candle
to **close** outside it, then trade the breakout with an ATR stop and RR take-profit.

## Install

1. Open TradingView → **Pine Editor**.
2. Paste the contents of `TradePilot_ORB_Strategy.pine`.
3. **Add to chart** → the *Strategy Tester* tab shows the backtest.
4. Run it on a **1–5 minute chart** (the chart timeframe is the breakout-confirmation
   timeframe, mirroring the EA's M1/M2/M5).

## How it maps to the EA

| EA behaviour | Pine strategy |
|--------------|---------------|
| NY 09:30 session, 15-min opening range | `Session Timezone` + `Session Start` + `Opening Range Minutes` |
| Confirmation TF M1/M2/M5 | the **chart** timeframe |
| ATR SL (14 / M15 / ×1.5) | `ATR Period` / `ATR Timeframe` / `ATR Multiplier` |
| RR take-profit (2.0R) | `Risk : Reward Ratio` |
| Fixed lot / Risk % | `Sizing Mode` + `Fixed Qty` / `Risk %` |
| One breakout per direction/day, one position, entry until 12:00 NY | built in |
| Trading days Mon–Fri | `Trading Schedule` toggles |

## Deliberate differences (platform constraints)

- **Single-symbol.** A TradingView strategy only trades the chart's symbol. To cover
  `XAUUSD, US100, US30, NZDUSD`, add the strategy to each symbol's chart (or duplicate
  layouts). The EA's single-chart multi-symbol loop has no Pine equivalent.
- **Timezone/DST is native.** New York time is resolved via the timezone input, so the
  EA's manual broker-GMT-offset / DST logic is not needed.
- **No spread filter.** TradingView backtests expose no reliable spread, so that filter
  is omitted.
- **"Lot" → "qty".** Sizing uses strategy `qty` (contracts/units); Risk % sizing derives
  it from `Risk % of equity` and the ATR stop distance.

## Notes

- Orders fill on candle **close** (`process_orders_on_close = true`), matching the EA's
  "act on the close of the confirmation candle".
- The opening range is drawn as a box with High/Low lines; entry/SL/TP lines and a stats
  dashboard are shown on-chart (all toggleable).
