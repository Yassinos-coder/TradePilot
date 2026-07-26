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

## ATR Projection Strategy

`TradePilot_ATR_Projection_Strategy.pine` is the Pine Script **v6 strategy** built on the
indicator above. The indicator draws the map; the strategy trades it. Both build the notches
identically (last confirmed weekly close + weekly-ATR notches, zone height from the 4H ATR
equilibrium of the last closed week), so the levels line up on-chart.

### Trade logic

1. **Bias gate** — only trades with the weekly structure (`Auto` or `Manual`). Ranging = no
   new trades.
2. **Arm** — a bar's range touches a projection zone. The approach side is recorded:
   - from the bias side → the zone is being tested as support (bull) / resistance (bear) = **Reaction**
   - from behind → price is pushing through the zone along the bias = **Breakout**
3. **Fire** — a confirmed bar (the same one or a later one, within `Arm Expiry`) closes beyond
   the zone along the bias, optionally requiring a directional candle body, **and both
   confirmation filters agree**:
   - **MA** — longs need price above the MA (200 by default, chart or higher timeframe),
     shorts below it. A weekly-bias long firing while price sits under the 200 MA is a
     contradiction, and this is what blocks it. Optional MA-slope requirement on top.
   - **Momentum** — RSI above its midline for longs / below the mirror for shorts, or a MACD
     histogram on the right side of zero.

   Neither filter is plotted. The dashboard's `Filters` row shows `MA ok / mom ok` (green) or
   which one is blocking (orange), so a skipped signal can be explained without adding lines
   to the chart. Both fail closed: while a series is still warming up there is no
   confirmation, so there is no trade.
4. **Stop** — the zone's protected edge ± an ATR buffer, or a plain ATR stop from entry.
5. **Target** — the next notch along the bias (mid or near edge), or a fixed RR. Trades below
   `Minimum RR` are skipped.
6. **Invalidation** — a Reaction arm dies when a bar closes through the zone against the bias.
   Open positions can be closed on a weekly bias flip.

### Key inputs

| Group | What it controls |
|-------|------------------|
| `Trend Detection` | `Auto` / `Manual` bias — same rules as the indicator |
| `ATR Projection` | `ATR Length`, zone height source (`4H ATR Equilibrium` / `Weekly ATR`) |
| `Entry Logic` | `Reaction` / `Breakout` / `Both`, confirmation close (zone edge or midline), confirmation buffer, candle-body filter, arm expiry, tradable notch range |
| `Confirmation Filters` | MA trend filter (`EMA`/`SMA`, length, timeframe, optional slope) and momentum (`Off` / `RSI` / `MACD Histogram`) — read only, never plotted |
| `Stop Loss` | `Zone Edge + ATR Buffer` or `ATR From Entry`, chart ATR length + multiplier |
| `Take Profit` | `Next Zone Mid` / `Next Zone Near Edge` / `Fixed RR`, plus `Minimum RR To Take Trade` |
| `Position Sizing` | `Risk %` of equity or `Fixed Qty`, plus `Max Position Notional (x Equity)` |
| `Trade Management` | Max trades per week, one trade per notch per week, cooldown after a loss, optional breakeven stop, exit on bias change |

### Defaults are tuned for the 2H chart

~12 bars/day, ~60/week, so the bar-count settings mean:

| Input | 2H default | Why |
|-------|-----------|-----|
| `Arm Expiry` | 15 bars | 30h — about how long a weekly level stays relevant after a touch |
| `Cooldown Bars After A Loss` | 6 bars | 12h of silence, so the chop that just stopped you out cannot immediately re-arm the notch |
| `Confirmation Buffer` | 0.15 × chart ATR | kills the marginal 2H closes that sit right on the level and reverse next bar |
| `Max Trades Per Week` | 3 | a 2H chart arms far more often than 4H |
| `Minimum RR` | 1.5 | drops the compressed setups that appear when price is already near the next notch |
| `Move Stop To Breakeven` | off | targets are a full ATR notch away, so the average win runs well past 1R — scratching at breakeven usually costs more than the drawdown it saves. Turn it on for a smoother curve |

### Install

1. Open TradingView → **Pine Editor**.
2. Paste the contents of `TradePilot_ATR_Projection_Strategy.pine`.
3. **Add to chart** → the *Strategy Tester* tab shows the backtest.
4. Run it on a **2H chart** (1H and 4H also work). Above 4H the zone height falls back to
   Weekly ATR, flagged orange on the dashboard.
5. If you are replacing an older version of the script on a chart, open the strategy's
   **Properties → Reset settings to defaults** — TradingView keeps your saved properties
   (including the margin setting) and they override the new declaration.

### Sizing: the thing that silently kills forex backtests

Risk-% sizing on an FX pair asks for roughly **3× equity in notional** for a real 1% risk,
because the per-unit risk is tiny (a 20-pip stop on NZDUSD is 0.002 per unit). If that order
is larger than the tester's margin allows, TradingView **rejects it** — you get an entry
marker on the chart and no trade in the report, which reads as "the strategy barely trades".

`Max Position Notional (x Equity)` (default `5`) caps qty instead of letting the order be
rejected, and the dashboard's `Last Qty` row shows `(capped)` in orange when the cap binds —
your realised risk is then below the `Risk %` target. Gold needs ~1×, FX ~3×, index CFDs
~1.5×. The script also declares `margin_long/short = 0` so the cap, not a silent rejection,
is what governs.

### Notes

- **Non-repainting HTF reads.** Every weekly / 4H value is read as `expr[1]` with
  `lookahead_on`, i.e. strictly the last *confirmed* higher-timeframe bar — identical on
  history and in realtime. The indicator uses `lookahead_off`, whose historical values lag one
  extra weekly bar, so backtest levels here can sit a week apart from the indicator's
  historical drawings. Live, the two agree.
- Orders fill on candle **close** (`process_orders_on_close = true`); entries require
  `barstate.isconfirmed`, so nothing fires intrabar.
- `calc_on_every_tick = true` so the dashboard, zone boxes and `Filters` row stay live during
  the forming bar. With it off, `barstate.islast` only turns true once a bar closes, which
  leaves the readout up to 2h stale on a 2H chart (Pine warning `CW10015`). It does not loosen
  the trade logic — entries are still gated on `barstate.isconfirmed` — and backtest results
  are identical either way, since history is always calculated bar-by-bar.
- One position at a time (`pyramiding = 0`). Single-symbol, like any TradingView strategy —
  add it to each symbol's chart separately.
- On-chart: projection zones (the armed one gets a highlighted border), entry/SL/TP lines,
  entry markers, and a stats dashboard — all toggleable.
