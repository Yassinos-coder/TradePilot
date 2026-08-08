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

---

## 4H / 15m Fibonacci Strategy

`TradePilot_Fibonacci_71_Strategy.pine` is a Pine Script **v6 strategy** implementing the
four-item checklist: higher timeframe alignment, liquidity sweep, break of structure plus
imbalance, and a 71% retracement entry.

**Defaults are set for an FX CFD on 15m with a 4H bias.** It works on any pair of timeframes
where the bias frame is higher than the chart; the script blocks itself if it is not.

### Trade logic

1. **Higher timeframe alignment** — the 4H dealing range, split at its 50%. Above it is
   premium and only shorts are allowed; below it is discount and only longs are. Two range
   definitions: the last confirmed 4H swing high/low (default), or the highest/lowest of the
   last N 4H bars. Read as `expr[1]` with `lookahead_on`, i.e. strictly the last *confirmed*
   4H bar, so the bias cannot repaint itself onto trades it never allowed.
2. **Liquidity sweep** — a confirmed swing high or low on the 15m is taken. The side that goes
   is the side that was holding the resting money, so the trade is back the other way. A
   **wick** through the level is a sweep; a **body close** through it is a break, and a break
   is not this setup — `Sweep Must Close Back Inside The Level` is the source's own
   distinction and is on by default.
3. **Break of structure** — price then closes through the opposing structural level. Either
   the one frozen at the sweep (default) or the most recent swing, which is stricter.
4. **Imbalance** — the three-candle fair value gap left inside that leg. On by default,
   because the checklist item is "break of structure *plus* imbalance".
5. **Entry** — a pending **limit** order at the 71% retracement of the leg, measured from the
   impulse extreme back toward the swept one.
6. **Stop** — the fib 100%, i.e. the swept extreme, plus an ATR buffer.
7. **Target** — the fib 0%, i.e. the impulse extreme. Or the next unbroken swing beyond it
   (`Liquidity Draw`), or a fixed RR.

### Why 71, and why it is not a magic level

It is a **measurement**, not a reaction level, and the script does not treat it as one.
Entering there puts 29% of the leg behind the stop and 71% in front of the target:

```
risk = (1 − 0.71) × leg      reward = 0.71 × leg      RR = 2.448
```

That ratio is the entire reason the number is 71 rather than 70 or 75. Lower it to 50 for 1:1
and far more fills; raise it to 79 for 3.76:1 and far fewer.

One useful side effect: with the default target the RR is fixed by geometry, so `Minimum RR`
stops being a reward filter and becomes a **minimum leg size** filter. At the default 0.10 ATR
stop buffer, a 3 ATR leg implies 2.19R and a 0.8 ATR leg implies 1.71R — so the 1.80 gate
silently rejects legs shorter than about one ATR, which are the ones where the buffer is a
large fraction of the risk. That is the intended behaviour, but know that it is what the input
is doing.

### The geometry is not the fill: why there is a cost gate

`Minimum RR` scales with ATR and nothing else, so it has no opinion about whether a stop is
large enough to survive its own spread. Drop to 5m on an FX pair and that bites immediately —
a one-ATR leg on 5m NZDUSD is about 8 pips, whose 29% stop is **2.4 pips**. Against a ~1.5 pip
round turn, more than half the risk per trade is cost, and a setup whose geometry says 2.45:1
fills at roughly 1.5:1. A zero-cost backtest cannot see this and will happily report a profit
factor above 1.5 on trades that lose money in an account.

`Minimum Stop (x cost)` is the gate. `Assumed Round-Turn Cost` is spread plus commission in
ticks (1 pip = 10 ticks on a 5-decimal feed), and a setup is skipped when its stop is not at
least that multiple of it. At the default 15 ticks × 4 the floor is **6 pips**, which is
passive on 15m and does most of the filtering on 5m. Set it to 0 to disable and watch the
trade count rise and the profit factor fall.

This feeds the pre-trade gate only. Actual costs belong in Properties → Commission and
Slippage; modelling them in the script as well would double-count.

### Premium and discount only mean something inside the range

In a trend the swing range goes **stale**: no new higher-timeframe pivot confirms for hours,
so price keeps climbing while the script still compares it against a high it left behind. Left
alone, a breakout reads as "premium, sells only" — trend-fighting, which is the one thing the
higher-timeframe filter exists to prevent. Seen live on NZDUSD 5m at **193%**, i.e. price a
full range width above the range high, blocking a long in an uptrend.

`When Price Is Outside The Range` decides what happens:

| Option | Behaviour |
|--------|-----------|
| `Block` (default) | no trades on a reading that is known to be invalid |
| `Follow Breakout` | above the range = longs only, below = shorts only — trade the higher timeframe *direction* instead of its range |
| `Fade (premium/discount)` | the old behaviour, kept so you can measure what it costs |

The dashboard's bias row now reports position and permission separately (`ABOVE range - no
trade  193%`), because "above the range" and "premium" are not the same statement.

Switching `Range Source` to `Lookback Range` sidesteps the problem entirely — price is inside
that range by construction — at the cost of a cruder range.

### The A+ confluence is measured, not assumed

The source's "hidden confluence" is the 71% landing **inside** the imbalance, on the argument
that entering where price is most likely to react is what keeps drawdown small. The script
detects it, flags it live on the dashboard, and reports the share of filled trades that had it
(`A+ %`). `Require The 71% To Sit Inside An Imbalance` makes it mandatory.

Run it **off** first. The A+ percentage tells you how often the confluence appears in your
sample, and comparing two runs tells you whether it is worth what it costs in trade count —
which is the question, and it is answerable rather than a matter of belief.

### The one genuine ambiguity: what happens when price runs further

The source says the setup stays valid "until one of those two levels is violated". Taken
literally, a new low past the fib 0% kills a short setup. In practice a trader re-draws the fib
to the new extreme. Both are implemented, and it is the input most likely to change your
results:

| `Fib Leg` | Behaviour |
|-----------|-----------|
| `Extend To Newest Extreme` (default) | re-anchors to the new extreme; the order, the target and the size follow price, and risk grows with the leg |
| `Fix At Break Of Structure` | the literal reading — a new extreme violates the 0% and the setup is dead |

Fix is honest but discards every setup where price simply ran further before turning. Extend is
what the tool in your hand does. Sweep both.

### Key inputs

| Group | What it controls |
|-------|------------------|
| `Higher Timeframe Alignment` | bias timeframe, swing vs lookback range, swing strength, a neutral band around the 50%, what happens when price is outside the range, and whether a bias flip pulls a working order |
| `Liquidity Sweep` | execution-chart swing strength (2 = the Williams fractal), minimum sweep depth, wick-vs-body-close requirement, and the failed-grab kill |
| `Break Of Structure` | which structure has to break, how long a sweep stays relevant, optional minimum break body |
| `Imbalance` | require a gap in the leg, require the 71% inside it, minimum gap size |
| `Fibonacci Entry` | the retracement percentage, leg extension behaviour, unfilled-order expiry |
| `Stop Loss` | ATR length and the buffer beyond the fib 100% |
| `Take Profit` | fib 0% / liquidity draw / fixed RR, plus the minimum RR gate |
| `Position Sizing` | `Risk %` or `Fixed Qty`, plus `Max Position Notional (x Equity)` |
| `Trade Management` | max hold, cooldown after a loss, optional entry session, optional breakeven |
| `Costs & Viability` | assumed round-turn cost in ticks, and the minimum stop expressed as a multiple of it |

### Defaults are tuned for 15m

Every duration is specified in **minutes and converted to bars internally**. A "20 bar" window
is 5 hours on 15m and 20 minutes on 1m, and a setting that changes meaning when you change
chart is a trap, not a setting.

| Input | 15m default | Why |
|-------|-------------|-----|
| `Higher Timeframe` | 240 | ~16 execution bars per bias bar — enough separation to mean something, little enough that it still changes inside a week |
| `Structure Swing Strength` | 2 | the Williams fractal the source's arrows come from |
| `Max Minutes From Sweep To Break` | 300 | 20 bars; a sweep that has not broken structure in five hours has been absorbed |
| `Cancel Unfilled Order After` | 720 | 12 hours — roughly the far side of the next session |
| `Stop Buffer` | 0.10 × ATR | the swept extreme is exactly where the stops that were just run sat; a stop resting on it with no buffer is resting on the noisiest price on the chart |
| `Minimum RR` | 1.80 | passive against the 2.45 ceiling; it is really the minimum-leg-size gate described above |
| `Max Hold` / `Cooldown` | off | the model has no time component — the trade runs to one of the two fib levels |
| `Move Stop To Breakeven` | off | this model *expects* drawdown past the entry, which is the whole reason the 71% is a limit and not a market order |

### Sizing

`Max Position Notional (x Equity)` defaults to **10**. The stop here is 29% of the leg plus a
buffer — 10–25 pips on 15m FX — so a 1% risk needs roughly 10× equity in notional. Below that
the cap binds, TradingView silently cuts the order, and every figure in the report is a
fraction of what the settings claim. The dashboard's `Last qty` row shows an orange
`(capped)` when it is biting.

### What is mechanised, and what is not

Faithful: premium/discount on the higher timeframe, the sweep of a confirmed swing, the
wick-versus-body-close distinction between a grab and a break, the break of structure, the
fair value gap, the 71% pending limit with its stop and target on the fib extremes, the
"valid until one of those two levels is violated" rule, and the fib/FVG confluence.

**Not** mechanised: "relatively equal highs/lows" as a named liquidity pool — that is a
judgement made by eye. The `Liquidity Draw` target approximates it with the nearest unbroken
swing beyond the fib extreme, which is usually where those equal lows sit, but the script is
not claiming to find them. The default target is the fib 0% the source actually uses.

### Notes

- Orders fill on candle **close** (`process_orders_on_close = true`); new orders require
  `barstate.isconfirmed`, so nothing arms intrabar.
- The working limit is **re-issued every bar** while it rests. In `Extend` mode the leg
  deepens, so the 71%, the target and the position size all move with it —
  `strategy.entry` with an existing ID modifies the resting order rather than adding one.
- Limit fills are detected from the **bar's range**, not from `position_size`: the emulator
  fills intrabar but the position is invisible to the script for a further bar, so cancelling
  on "still flat" would race a cancel into an order that was filling. A stale-fill guard
  releases the state if the two ever disagree.
- Exit orders are attached on the **same bar as the entry order**, keyed on the trade's
  direction rather than on an open position, so there is no bar where a filled trade runs
  without a stop in the emulator.
- One position at a time (`pyramiding = 0`). Single-symbol — add it to each chart separately.
- On-chart: the fib 100 / 71 / 0 levels, the imbalance boxes, the 4H equilibrium, sweep and
  break markers, live stop/target lines, and a dashboard — all toggleable.

### Dashboard rows worth reading first

- `Gates` — names the single condition currently blocking a setup (`4H bias blocks it`,
  `no imbalance`, `71% not in imbalance`, `RR too low`), so a skipped signal can be explained
  without adding lines to the chart.
- `Swp>BOS>Ord>Fill` — **the funnel**, and the first row to read when the trade count looks
  low. Read it left to right and stop at the first big drop; that stage is what is rejecting
  your setups, and it is the only one worth changing a setting for.

  | Drop at | Means | Do this |
  |---------|-------|---------|
  | Swp → BOS | sweeps are being absorbed without a structural break | raise `Structure Swing Strength`, or lengthen `Max Minutes From Sweep To Break` |
  | BOS → Ord | breaks happen and the gates kill them | read `Gates`; usually the 4H bias, `Require An Imbalance`, or — below 15m — `stop too small vs cost` |
  | Ord → Fill | orders rest and never fill | 71% is too deep a retracement for this symbol — lower `Retracement Entry`, and accept the worse RR |

- `Orders S / L` — an all-time counter per direction. If one stays at **zero** while the other
  climbs, that direction's condition is contradicting itself and you are running half the model
  without knowing. The Strategy Tester cannot show you this.
- `Cancel/Time  A+%` — cancelled orders, time stops, the share of fills that had the A+
  confluence, and the break-even win rate your `Minimum RR` implies. If the tester's win rate
  is below that figure, the settings cannot be profitable and sweeping anything else is wasted
  time.

### Install

1. TradingView → **Pine Editor** → paste `TradePilot_Fibonacci_71_Strategy.pine` →
   **Add to chart**.
2. Run it on a **15m chart** with the higher timeframe left at 240.
3. Set Properties → Commission and Slippage **before** judging anything. For IC Markets Raw
   on NZDUSD: commission type `Percent`, value `0.006`, slippage `5` ticks for a baseline and
   `15` for a stress run. A strategy that survives at 5 and dies at 15 is not robust to a
   floating spread, which is what you actually trade against. This matters more the lower the
   timeframe: on 5m the stop is a third of what it is on 15m and the spread is unchanged.
4. If you are replacing an older version of the script on a chart, open **Properties → Reset
   settings to defaults** — TradingView keeps your saved properties and they override the new
   declaration.
