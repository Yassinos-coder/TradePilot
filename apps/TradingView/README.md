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

---

## Dynamic VWAP Strategy

`TradePilot_Dynamic_VWAP_Strategy.pine` is a Pine Script **v6 strategy** derived from
Chen, R. (2024), *"A Review of VWAP Trading Algorithms: Development, Improvements and
Limitations"* (ICFTBA, DOI `10.54254/2754-1169/135/2024.18582`).

**Defaults are set for NZDUSD CFD on 2H with a weekly anchor.** See *Configuration* below
before running it anywhere else.

The paper reviews VWAP as an **execution** algorithm — its objective is minimising tracking
error against the market VWAP, not predicting direction — so it cannot be ported literally
into a strategy. What is portable is the volume model the paper spends most of its length on,
plus the two failures it names. Both are implemented.

### Why there is no volume in this script by default

On a CFD, `volume` is the broker's own tick count. It is venue-dependent, not comparable
between brokers, and on FX there is no consolidated tape behind it. Weighting a benchmark by
that number means your *broker* defines the benchmark.

The fix is not to drop the model but to swap the **activity proxy** underneath it. Clark
(1973) *Mixture of Distributions Hypothesis* and Ané & Geman (2000) establish that volume and
volatility are both observable proxies for the same latent information-arrival process — the
"market clock". Volume is one measurement of how much happened in an interval; realised range
is another, and on a CFD it is the honest one, because range comes from price and price is
what you are filled at.

So the default proxy is **true range**, and `V = D · φ · ε` becomes `A = D · φ · ε` with the
structure untouched. `ε` stops being a volume surprise and becomes a **volatility surprise**,
which is arguably closer to the impact literature the direction logic rests on. Set
`Activity Proxy = Volume` on futures or cash equities, where the tape is real.

### The model

| Term | Meaning | Implementation |
| --- | --- | --- |
| `D` | level | EWMA of prior completed session totals |
| `φ` | cycle | EWMA of prior sessions' activity **share** per slot — the U-shape (Biais et al.; Dufour & Engle) **learned** for this symbol and timeframe, nothing hardcoded |
| `ε` | specific / random | the residual, `actual / expected` |

`ε` is the signal. Lo et al. and He et al. call `D` and `φ` the *stable* components and `ε` the
*random* one; Bialkowski et al. model exactly this residual to cut VWAP tracking error by 7%.

The benchmark itself is the paper's Eq. (1), anchor-scoped, with **activity-weighted** σ bands
built from the same weights as the mean (`Σap²/Σa − WAP²`) rather than a bar-count stdev —
otherwise the line and the bands disagree about what "average" means.

### Trade logic

Gomes & Waelbroeck (2015) [ref 23] separate liquidity-driven from informed metaorders; Cont,
Kukanov & Stoikov (2014) [ref 25] model the price impact of order-book events. The standing
result: impact from uninformed flow is **transient**, impact from informed flow is
**permanent**. So displacement means two opposite things, and `ε` tells them apart:

| Price | `ε` | Read | Trade |
| --- | --- | --- | --- |
| ≥ `revEntryZ` σ from WAP | **decaying** | impact is fading — thin-book drift, transient | **Reversion**, target = the WAP itself |
| breaks `momEntryZ` σ | **high** (loud) | abnormal activity — informed flow, permanent | **Momentum**, target = `momTargetZ` σ |

There is a deliberate dead zone between the thresholds where the model has no opinion and
takes no trade.

**The two legs use separate bands, and that is load-bearing.** Sharing one forced broken
geometry on the momentum side: entering a break at the same 2σ the reversion fades leaves only
1.5σ of room to a 3.5σ target against a 1σ stop — **1.5:1, which needs a 40% hit rate**. So
momentum enters on the *near* band (1σ) where the trade has somewhere to go, and its stop sits
at the **WAP** rather than a distance from the fill, because the invalidation for a
permanent-impact read is "the benchmark was not dragged" — a level, not an offset.

**Reversion tests `ε` decay, not `ε` level.** Under a *volume* proxy, "far from VWAP on low
volume" is a real and common state — the liquidity vacuum. Under a *range* proxy it is close to
self-contradictory, because being 2σ from the WAP is precisely what large ranges do; the leg
goes silent and you unknowingly run momentum-only. The correct signature of transient impact is
impact that **decays** (Cont et al.; Gomes & Waelbroeck), so the test is falling `ε` over
`revDecay` bars, with `quietMax` demoted to a ceiling.

### Regime filter (not from the paper)

100 EMA and 200 EMA on the chart timeframe. Price above **both** = longs only, below **both**
= shorts only, between them = **no trade**. Neither EMA is drawn on the chart; both values and
the live bias are on the dashboard.

It is not redundant with either leg — a momentum long above both EMAs is trend continuation,
a reversion long above both EMAs is buying a dip inside an uptrend — and it removes the two
worst cases outright: fading a rally in a downtrend, and chasing a break against the
higher-timeframe trend.

### The paper's two failures, and what answers them

1. **"Heavily relies on accurate predictions of intraday volume distribution."** No trading
   until `φ` is learned from `Min Sessions Learned` anchor periods, and never in a slot whose
   `φ` is still unlearned. Live forecast error is on the dashboard.
2. **"Completely static... cannot incorporate the latest market information."** The entire
   quiet/loud regime switch above.

### Configuration

**Why the weekly anchor on 2H.** A 24h FX day is only 12 bars at 2H — too few slots to learn a
shape from, and the activity-weighted σ is meaningless for the first third of every session. A
week is 60 bars, so `slot` becomes hour-of-week, and the FX weekly activity cycle (Sunday/Asia
dead, London–NY overlap peak, Friday afternoon dead) is strong and stable. The horizon flat
then lands before the weekend gap, which is where an FX position should not be anyway.

Switch `Anchor` to `Session (Daily)` for 15m and below — the bar-count defaults below would
all need re-tuning for it.

| Input | 2H default | Reasoning |
| --- | --- | --- |
| `Anchor` | Weekly | 60 slots/week at 2H vs 12/day |
| `Activity Proxy` | True Range | CFD volume is broker tick count |
| `Profile Memory` | 12 | weeks ≈ a quarter, about as long as an FX activity regime holds |
| `Min Sessions Learned` | 6 | 6 weeks of warm-up before the first trade |
| `Surprise Smoothing` | 2 | 4h — kills one-print flips without lagging the news bar |
| `Reversion Band` | 2.0 σ | also the reversion target, so it is the reward leg |
| `Momentum Break Band` | 1.0 σ | near band — reward is `momTargetZ` minus this |
| `Quiet ceiling / Decay` | 1.00 / 3 bars | decay does the work; see the note above |
| `Loud` | 1.40 | 40% more range than the slot predicts |
| `Reversion Stop` | 1.0 σ | gives 2.0:1, break-even 33% |
| `Momentum Target / Stop` | 4.0 σ / 0.25 σ below WAP | gives 2.4:1, break-even 29% |
| `Reversion Time Stop` | 12 | 24h at 2H |
| `Skip First N Slots` | 3 | first 6h of the FX week — weekend gap and Asia reopen |
| `Flat N Slots Before Close` | 3 | flat 6h before the Friday close |
| `Max Trades Per Session` | 5 | per week |
| `Max Position Notional` | 3x | FX needs ~3x equity for a real 1% risk |
| `Participation-Weighted Sizing` | **off** | see below |

**Guards** — each maps to one named defect, not to a market view. Guards can only
*remove* trades; they cannot manufacture a signal, which is a materially lower overfitting
risk than adding predictive parameters. They are still parameters, so they still cost sample.

| Guard | Default | Defect it fixes |
| --- | --- | --- |
| `Max Chase Past Band` | 0.35 σ | Fills happen at bar close, so a bar running 0.8→1.6σ enters at 1.6σ: risk to the WAP grows, room to target shrinks, 3:1 quietly becomes 2:1 |
| `Stop Floor (x ATR14)` | 1.0 | Early in an anchor window σ is built from a handful of bars and can be tighter than one bar's ordinary travel — the stop sits inside noise |
| `Momentum Time Stop` | 30 bars | Reversion had a time stop and momentum did not, with nothing behind the asymmetry |
| `Cooldown After Exit` | 3 bars | Entry conditions are usually still true the bar after a stop-out, so it re-enters the same failed idea and pays the spread again |
| `Outlier Clamp` | 4× forecast | φ is *persistent*: one bad broker print sits in the EWMA for the whole memory window, skewing every slot comparison after it |
| `Min Target / Cost` | 3× | Trades taken while σ is compressed are negative before they open |
| `Block Entries In Thin Hours` | 21:00–23:00 | Post-NY-close spreads blow out; one fill at 6 pips instead of 0.6 costs ~10 trades of average edge |
| Session-length sanity | ±50% | A holiday week or data outage collapses the learned `typicalLen` and fires the horizon flat early for weeks afterwards |

### Setting costs in the Strategy Tester

Costs belong in Properties, not in the script — putting a spread model in Pine *and* setting
slippage double-counts. The `Costs & Liquidity` inputs above feed the pre-trade edge gate only.

For **IC Markets Raw on NZDUSD** ($3.50/side/lot commission, 100k contract):

| Property | Value | Working |
| --- | --- | --- |
| Commission type | Percent | |
| Commission value | **0.006** | $3.50 per side ÷ $58,900 notional (1 lot @ 0.589) |
| Slippage | **5 ticks** | models ~1 pip of round-turn spread — TV applies it to entry *and* exit |
| Slippage (stress run) | **15 ticks** | ~3 pips, for the thin-hours and news fills |

Run the baseline and the stress case. A strategy that only survives at 5 ticks and dies at 15
is not robust to a floating spread, which is what you actually trade against.


**Participation sizing is off on purpose.** Under a *volume* proxy it is the VWAP execution
principle — size tracks predicted liquidity, deep slots get a bigger clip. Under a *range*
proxy the identical scalar means size tracks predicted **volatility**, which is backwards for
risk *and* double-counts, because Risk-% sizing already divides by a σ-scaled stop. Only
enable it alongside `Activity Proxy = Volume`.

### Parameter optimization protocol

With ~11 free parameters, this strategy can be fitted to any sample you point it at. The
protocol matters more than the sweep.

**Before you optimize anything:**

1. **Set realistic costs.** Properties → Slippage and Commission. A zero-cost backtest will
   optimize toward parameter sets that die on spread — and a 33%-win-rate mean-reversion book
   is exactly the kind that does. NZDUSD on a 5-decimal feed has 1 pip = 10 ticks, so a
   1.5–2 pip retail spread is **15–20 ticks of slippage**. Set it and re-baseline first.
2. **Extend the window.** Three months at 2H, minus 6 weeks of profile warm-up, leaves ~7
   tradeable weeks. That is not a sample. Use 3+ years.
3. **Count trades.** Rule of thumb: at least 30 trades per parameter you intend to optimize.
   50 trades buys you one parameter, honestly. 300 buys you three or four.

**Then, in this order — lock each stage before moving on:**

| Stage | Sweep | Why here |
| --- | --- | --- |
| 1 | Reversion-only / Momentum-only / Both | 3 runs, and the highest-value test there is: it tells you whether the `ε` switch does anything at all. If a leg is negative standalone, delete it rather than tuning it. |
| 2 | `Bias Filter`: Off / Slow only / Strict / Strict+stack | 4 runs. Confirms the EMA filter earns its place instead of just cutting trade count. |
| 3 | `Deviation Band` 1.5 to 2.5, crossed with the `Quiet`/`Loud` thresholds | the core geometry |
| 4 | `Reversion Stop`, `Momentum Target`, `Time Stop` | exits, once entries are settled |
| 5 | `Profile Memory`, `Min Sessions Learned` | **last, and barely.** These are the model's memory; tuning them is the most direct route to curve-fitting one specific sample. |

**Read the dashboard's bottom two rows first, every time.**

- `Legs taken REV / MOM` — an all-time counter per leg. If one stays at **zero** while the
  other climbs, its entry condition is contradicting itself and you are running half the
  strategy without knowing. The Strategy Tester cannot show you this; it turns red here.
- `RR rev / mom (BE win%)` — the reward:risk your current inputs actually imply, and the hit
  rate each leg needs to break even. **If the tester's win rate is below the break-even
  figure, the settings cannot be profitable**, and sweeping anything else is wasted time. Check
  this before you start, not after.

**Judging a sweep:** ignore Net Profit — it rewards whichever setting happened to catch the
biggest move. Use Profit Factor subject to a minimum trade count, and pick from a **plateau,
not a peak**. A value that works at 2.0 but fails at 1.75 and 2.25 is noise, not a setting.

**Verify out of sample:** split the history 70/30, optimize on the first 70% only, then run
the untouched 30% once. If PF collapses, the parameters are fitted and the in-sample number
was never real.

### Requirements

Intraday chart. Volume is only required if you select a volume-based proxy; both conditions
are checked and flagged red on the dashboard (`BLOCKED`).

Install: TradingView → Pine Editor → paste `TradePilot_Dynamic_VWAP_Strategy.pine` →
**Add to chart**. Let it run through `Min Sessions Learned` periods before judging anything.

---

## London Session Strategy

`TradePilot_London_Session_Strategy.pine` is a Pine Script **v6 strategy** implementing the
"time before price" London model: a fixed 90-minute window, the range that existed before it,
one side of that range being taken, and a displacement back the other way.

**Defaults are set for an FX CFD on 5m.** The script blocks itself above 15m — a 90-minute
window is 3 bars on 30m and 1.5 on 1H, which would force the sweep, the displacement and the
entry to be the same candle.

### Trade logic

1. **Time** — 03:00 New York, and a 90-minute window from it (`0300-0430`). Nothing outside
   the window is looked at. New York is the correct timezone even for a London session,
   because the key time is defined in Eastern and Eastern handles its own DST.
2. **Range** — the high and low established *before* the key time. Two definitions:
   - `Session Window` (default `2000-0300` NY, the Asian range) — ends exactly at the key time.
   - `Previous Hourly Candle` — the last completed 1H candle before the key time, i.e. the
     "2am sets it, 3am manipulates it, 4am expands" three-candle framing. Read via
     `high[1]` with `lookahead_on`, so it is the last *confirmed* hourly bar and does not
     repaint.
3. **Sweep** — one side of that range trades through inside the window. Which side does not
   matter; the side that goes is the side that was holding stops, and the trade is back the
   other way. A bar that takes both sides is read by its own close.
4. **Displacement** — the confirmation, and the thing that makes this a strategy rather than
   a pattern. A candle that closes beyond the extreme of a run of **N consecutive
   opposing-close candles** (for a short: below the *lowest low* of the last N up-close
   candles — that is what "close below 1, 2, 3 up close candles" means), with a **body** of at
   least `Min Displacement Body × ATR`. Body, not range: a big wick is the opposite of
   displacement. This one input does most of the filtering — sweep it first.
5. **Entry** — on the displacement close, or a limit into the FVG or the order block it left.
6. **Stop** — beyond the sweep extreme + an ATR buffer. That level, not a distance from the
   fill, is what says the sweep was not a sweep.
7. **Target** — 50% of the **new** range (sweep extreme → far side of the old range), or the
   opposite extreme.

The new range is the load-bearing idea. Once the old high is taken, the dealing range is
redrawn from the sweep extreme down to the old low, and the entry sits in the **premium** of
that new range by construction — which is why a short off the displacement close is valid
without waiting for a deeper retracement into a premium price has already spent time in.
`Entry Must Be In Premium / Discount` enforces it.

### Read this before you judge the trade count: RR and target interact

Risk runs from the displacement close back over the sweep extreme; reward to the equilibrium
is only *half* the new range. On a 30-pip Asian range that geometry typically implies
**1.2–1.6R**, so the 1:2 minimum the model quotes verbally will reject nearly every setup and
the strategy looks broken rather than strict. Hence:

| Target | Sensible `Minimum RR` |
|--------|----------------------|
| `New Range 50% (Equilibrium)` (default) | **1.5** (default) |
| `Opposite Range Extreme` | **2.0** — roughly double the reward, clears 1:2 comfortably |

Sweep these two together or not at all. The dashboard's `Live setup RR` row shows the number
the current inputs actually imply on the live setup, next to the gate it has to clear.

### Key inputs

| Group | What it controls |
|-------|------------------|
| `Time` | timezone, the 90-minute window |
| `Range` | session window vs previous hourly candle, and the pre-key-time session |
| `Sweep` | minimum sweep depth, require close back inside the range, allow re-arm on the other side |
| `Displacement` | opposing candles closed through, run lookback, min body × ATR, require an FVG |
| `Entry` | market on displacement / limit at FVG / limit at order block, zone fill level, limit expiry, premium-discount check |
| `SMT Divergence` | optional correlated symbol that must have *failed* to sweep its matching edge |
| `Stop Loss` | sweep extreme + buffer, or ATR from entry |
| `Take Profit` | new-range 50%, opposite extreme, or fixed RR — plus the minimum RR gate |
| `Position Sizing` | `Risk %` or `Fixed Qty`, plus `Max Position Notional (x Equity)` |
| `Trade Management` | max trades per day, max hold, force-flat window, optional breakeven |

### Defaults are tuned for 5m

18 bars in the window, so the bar-count settings mean:

| Input | 5m default | Why |
|-------|-----------|-----|
| `Min Opposing Candles Closed Through` | 2 | at 1 this is nearly any engulfing bar; at 3 it is rare on 5m |
| `Min Displacement Body` | 0.8 × ATR | the line between displacement and an ordinary close through two small candles |
| `Cancel Unfilled Limit After` | 30 min | the window itself cancels the rest |
| `Max Trades Per Day` | 1 | one window, one setup, done |
| `Max Hold` | 120 min | a setup that has not resolved in two hours is no longer the trade that was taken |
| `Force Flat Outside` | `0300-1200` | ends before the New York open; the model has no read on that session |
| `Move Stop To Breakeven` | off | the target is a fixed structural level, not a runner, so scratching usually costs more than the drawdown it saves |

Both durations are **minutes, converted to bars internally**. They were specified in bars
until a 1m run showed why that is wrong: 24 bars is two hours on 5m and twenty-four *minutes*
on 1m, and it closed a working trade six pips short of a target price reached twenty minutes
later. A time stop is a statement about how long an idea stays valid — a duration, not a bar
count.

### Sizing: this model's stop is small, so the notional cap binds hard

`Max Position Notional (x Equity)` defaults to **20** here, not the 3 the 2H strategies in
this folder use, and the difference is not a matter of taste:

```
required notional = (risk% × equity ÷ stop distance) × price
```

The stop is the sweep extreme — **3–4 pips on 1m, 8–10 on 5m**. A 1% risk on EURUSD therefore
needs roughly **33× equity at 1m** and **13× at 5m**. At 3× the cap binds on the first trade
and silently cuts realised risk to about **0.09%**, so every figure in the report is a tenth
of what the settings claim and the equity curve looks flat whether the model works or not.

The cap is a **rejection guard**, not a risk control — risk is already set by `Risk %` and the
stop distance. Watch the dashboard's `Last qty` row: an orange `(capped)` means it is biting
and your realised risk is below target.

### What is mechanised, and what is not

Faithful: the key time and window, both range definitions, the sweep, the displacement test,
order block and FVG entries, the premium/discount check, the 50% target, and SMT.

**Not** mechanised: "smooth" or "relatively equal" lows as a target selector — that is a
judgement made by eye, and the script targets the new range's equilibrium or its opposite
extreme instead. Equal lows tend to sit near one of those when they exist, but the script is
not claiming to find them. Higher-timeframe draw on liquidity is likewise absent: it is used
to choose *which* of several candidate legs to take, and one gated window per day already does
most of that filtering.

### Notes

- Orders fill on candle **close** (`process_orders_on_close = true`); entries require
  `barstate.isconfirmed`, so nothing fires intrabar.
- Exit orders are attached on the **same bar as the entry order**, keyed on the trade's
  direction rather than on an open position. With orders filling on close,
  `strategy.position_size` does not report the trade until the next bar, and a
  position-gated exit would leave the bar in between running without a stop in the emulator.
- Limit fills are detected from the **bar's range**, not from `position_size`, for the same
  reason: the emulator fills intrabar but the position is invisible for a further bar, so
  cancelling on "still flat" would race a cancel into an order that was filling. A cancelled
  order returns the day's trade allowance.
- One position at a time (`pyramiding = 0`). Single-symbol — add it to each chart separately.
- On-chart: the range box, the window shading, the new-range 50%, sweep and entry markers,
  live stop/target/working-limit lines, and a dashboard — all toggleable.

### Dashboard rows worth reading first

- `Gates` — names the single condition currently blocking a setup (`RR too low`,
  `not in premium/discount`, `no FVG`, `max trades`), so a skipped signal can be explained
  without adding lines to the chart.
- `Displacement` — the live run count and whether the body qualifies.
- `Days W>S>D>T` — **the funnel**, and the first row to read when the trade count looks low:
  windows seen → days that **s**wept → days that **d**isplaced → days that **t**raded. Read
  it left to right and stop at the first big drop; that stage is what is rejecting your
  setups, and it is the only one worth changing a setting for.

  | Drop at | Means | Do this |
  |---------|-------|---------|
  | W → S | the range is too wide to be taken inside 90 minutes | shorten `Range Window`, or switch `Range Source` to `Previous Hourly Candle` |
  | S → D | sweeps happen but nothing displaces | lower `Min Displacement Body`, or `Min Opposing Candles Closed Through` to 1 |
  | D → T | setups form and the gates kill them | check `Minimum RR` against your `Target` (see the table above) |

  A funnel like `5 > 1 > 1 > 1` is not a bug — it says the sweep landed outside the window on
  four of five days, which is the model working as specified rather than failing.
- `Taken S / L` — an all-time counter per direction. If one stays at **zero** while the other
  climbs, that direction's condition is contradicting itself and you are running half the
  model without knowing. The Strategy Tester cannot show you this.
- `Time/Flat/Unfilled` — how trades ended, plus the break-even win rate your `Minimum RR`
  implies. If the tester's win rate is below that figure, the settings cannot be profitable
  and sweeping anything else is wasted time.

### Install

1. TradingView → **Pine Editor** → paste `TradePilot_London_Session_Strategy.pine` →
   **Add to chart**.
2. Run it on a **5m chart** (1m–15m supported).
3. Set Properties → Commission and Slippage before judging anything. A single trade per day
   against a floating spread is a low-frequency book; costs are a large share of the edge.
   This matters more at 1m than anywhere else: a 3-pip stop against a ~0.7 pip EURUSD spread
   puts costs at roughly **a quarter of your risk per trade**.
4. Check the chart's session times line up with 03:00 New York on your data feed — the range
   box should sit immediately to the left of the shaded window.

### Why the trade count looks low, and why that is arithmetic rather than a bug

TradingView loads a fixed **bar count**, not a fixed time span — 5,000 bars on the free tier,
20,000 on Premium. At 1m that is roughly **3 trading days**; at 5m, about 17. The model then
caps itself at one trade per day and only fires on days that both sweep the pre-key-time range
*and* displace inside the 90-minute window. Three days × one trade × maybe half of days
qualifying is **one trade**, and no amount of loosening the inputs will change that — the
sample is bounded by the data, not the settings.

Judge this strategy on 5m or 15m, where the same bar budget buys 5–15× the history.
