# TradePilot MetaTrader EAs

Expert Advisors for MT5 and MT4 that connect to TradePilot. On a master account they report every trade; on a slave account they execute the copies the server sends.

---

## MT5 — `MT5/TradePilot_ATR_Excursion_EA.mq5`

This is the live-trading port of
`apps/TradingView/TradePilot_ATR_Excursion_Strategy.pine`. It is a standalone
strategy EA; it does not need the TradePilot server or an API key.

### What it executes

- Reads swing structure only from fully closed daily bars and optionally requires
  weekly, daily, and H4 moving-average agreement.
- Uses the last completed weekly close and weekly ATR as the excursion grid.
- Tracks how much of the current week's favorable and adverse ATR budget has
  already been spent.
- Arms the deepest enabled pullback zone touched, then requires a bullish/bearish
  candle-body reclaim within the configured number of bars.
- Opens a real market order with a broker-side stop and T2.
- Sizes in fixed lots or by percentage of equity using MT5's account-currency
  loss calculation for one lot at the proposed stop.
- Monitors T1 live, partially closes the configured percentage, moves the runner
  to breakeven, trails it, and enforces bias-flip, bar-count, and Friday exits.
- Persists setup, weekly-gate, and open-position management state in MT5 terminal
  global variables so a terminal or EA restart does not abandon an open trade.

### Install and run

1. Copy `MT5/TradePilot_ATR_Excursion_EA.mq5` into the terminal's
   `MQL5/Experts/` folder.
2. Open it in MetaEditor and press **F7**. The source in this repository compiles
   with 0 errors and 0 warnings.
3. Attach it to the symbol's **H1 or H2** chart and enable **Algo Trading**.
4. Confirm `EnableTrading=true`. Each chart instance trades only its own symbol
   and `MagicNumber`.
5. Set the session and Friday hours in **broker server time**. TradingView uses
   the symbol exchange timezone, so convert `07:00–19:00` if the broker clock is
   different.

`RespectAnySymbolPosition=true` is the safe default: the EA will not enter if
another EA or a manual position already exists on that symbol. Keep Magic Numbers
unique across EA instances.

### Account protection defaults

| Setting | Default | Scope / behavior |
|---|---:|---|
| `MinimumLotSize` / `MaximumLotSize` | `0.01` / `1.00` | Risk-sized entries below the effective minimum are skipped, never rounded up; entries above the maximum are capped. Broker limits still apply. |
| `MaxStrategyOpenTrades` | `3` | Maximum open positions across all symbols carrying this EA's `MagicNumber`. |
| `MaxAccountOpenTrades` | `0` | Optional cap including manual and other-EA positions; `0` disables it. |
| `MaxTradesPerDay` | `2` | Entry cap across this `MagicNumber`, reset at broker midnight. |
| `MaxLosingTradesPerDay` | `2` | Counts net losing fully closed positions, not individual T1/runner scale-outs. |
| `MinimumAccountEquity` | `0` | Optional hard equity floor in account currency; `0` disables it. |
| `MaxFloatingDrawdownPct` | `10%` | Stops the strategy when account equity falls this far below balance. |
| `MaxDailyLossPct` / `MaxDailyLossMoney` | `3%` / `0` | Account-level realized plus floating loss for the broker day; either enabled threshold can trigger. |
| `CloseStrategyOnEquityStop` | `true` | Closes every open position with this `MagicNumber`; it does not close unrelated manual trades. New entries remain locked until the next broker day. |

The existing `MaxTradesPerWeek=3` remains a per-symbol weekly setup cap. Equity
and daily-loss rules use broker server time. Use a unique Magic Number if this
strategy should have a protection boundary separate from another EA.

### Backtest correctly

Use MT5 Strategy Tester with **Every tick based on real ticks**, an H1/H2 test
period, and enough history for the 200-period weekly MA. Include realistic spread,
commission, swap, and execution delay. The EA acts on a completed signal candle
at the first tradable tick of the next candle; TradingView's
`process_orders_on_close=true` models a fill at the signal candle's close, so a
small fill and result difference is expected.

If the requested T1 scale-out is smaller than the broker's minimum lot or would
leave an invalid remainder, the EA closes the full position at T1 rather than
leaving an unmanaged fractional runner.

---


### How it works

1. At 09:30 New York, the first `OpeningRangeMinutes` (default 15) form the **opening range** (High/Low incl. wicks).
2. On the confirmation timeframe (M1/M2/M5), the EA waits for a candle to **close** outside the range: close above High → **BUY**, close below Low → **SELL**.
3. **SL** = entry ∓ `ATR × AtrMultiplier`; **TP** = entry ± `SL distance × RiskRewardRatio`.
4. Default behavior is one trade per symbol per NY day; `OneTradePerSymbolDay=false` allows one breakout per direction. Exits are SL/TP only in v1.

### Broker time / DST

New York 09:30 is converted to broker server time with US Eastern DST applied automatically. Two modes:

- **AUTO_DETECT** (default) — derives the broker's UTC offset at runtime; best for **live** trading.
- **MANUAL_OFFSET** — set `ManualBrokerGmtOffset` (broker winter GMT offset, e.g. `+2`) and `BrokerFollowsEuDst`; deterministic and recommended for the **Strategy Tester / optimization** (where auto-detect can be unreliable).

### Key inputs

| Input | Default | Description |
|-------|---------|-------------|
| `Symbols` | `XAUUSD,US100,US30,NZDUSD` | Comma-separated symbols to trade |
| `SessionStartHour` / `Minute` | `9` / `30` | NY session start |
| `OpeningRangeMinutes` | `15` | Opening range duration |
| `EntryWindowEndHour` / `Minute` | `12` / `0` | Latest NY time to take a breakout |
| `BrokerTimeMode` | `AUTO_DETECT` | `AUTO_DETECT` (live) or `MANUAL_OFFSET` (tester) |
| `ManualBrokerGmtOffset` | `2` | Broker winter GMT offset (MANUAL mode) |
| `BrokerFollowsEuDst` | `true` | Broker shifts +1h on EU summer time (MANUAL mode) |
| `ConfirmTimeframe` | `M1` | Breakout confirmation TF (M1/M2/M5) |
| `AtrPeriod` / `AtrTimeframe` / `AtrMultiplier` | `14` / `M15` / `1.5` | ATR stop-loss |
| `RiskRewardRatio` | `2.0` | Take-profit as a multiple of risk |
| `SizingMode` | `RISK_PERCENT` | `FIXED` or `RISK_PERCENT` |
| `FixedLotSize` / `RiskPercent` | `0.10` / `1.0` | Lot per mode |
| `SkipIfRiskLotBelowMin` | `true` | Risk% mode skips trades where broker min lot would exceed requested risk |
| `MaxSpreadPoints` | `50` | Skip entry above this live tick spread (0 = off) |
| `RespectAnySymbolPosition` | `false` | If true, block entries when any position exists on the symbol |
| `TradeMonday…TradeFriday` | `true` | Allowed weekdays |
| `MagicNumber` / `SlippagePoints` | `20260723` / `20` | Order identity / max deviation |
| `OneTradePerSymbolDay` | `true` | Once any trade is taken, ignore opposite breakouts until next NY day |
| `EnableTrading` | `true` | `false` = dry-run (log only) |
| `EnableLogging` | `true` | Verbose Experts-tab logging |
| `ShowDashboard` | `true` | On-chart status panel (auto-off in tester) |

Every parameter is an `input`, so all are optimizable in the Strategy Tester.

### Backtesting

Use `BrokerTimeMode = MANUAL_OFFSET` with the correct `ManualBrokerGmtOffset` for the tester's server time. Test on the confirmation timeframe (e.g. M1) with "Every tick based on real ticks". For multi-symbol runs, the tester loads the other symbols' data on demand.

---

## MT4 — `MT4/TradePilot_EA.mq4`

**Requirements:** MetaTrader 4 on Windows (uses `winhttp.dll`, available since Windows Vista SP2).

### Install

1. Copy `TradePilot_EA.mq4` to:
   ```
   %APPDATA%\MetaQuotes\Terminal\<id>\MQL4\Experts\
   ```
2. In MT4 go to **Tools → Options → Expert Advisors** and tick:
   - **Allow automated trading**
   - **Allow DLL imports**
3. Open MetaEditor (F4) and compile — should show 0 errors.
4. Open any chart (e.g. XAUUSD H1).
5. Drag the EA onto the chart.
6. Set the same inputs as MT5 above.
7. Click OK.

### Notes

- MT4 uses the WinHTTP WebSocket API via `winhttp.dll` (standard Windows system DLL).
- Polling happens every 1 s on `OnTimer` and on every tick via `OnTick`.
- Attach to an active pair (XAUUSD, EURUSD) for more frequent tick-based polling.

---

## Getting your API key

1. Log into TradePilot at `https://tradepilot.sidedevelopments.com`
2. On the Dashboard, click **Rotate API Key** to generate a fresh key.
3. Copy the full `tp_ea_...` (an EA key from Settings > API & Keys)xxxxx...` string — it is shown only once after rotation.
4. Paste it into the **ApiKey** input field of the EA.

---

## Testing end-to-end

1. Attach EA → confirm `Auth success` in terminal log.
2. In TradePilot → **Telegram** page → type a signal and click **Send**:
   ```
   XAUUSD BUY @ MARKET SL: 2010 TP1: 2030 TP2: 2040
   ```
3. Watch for `<- signal` and `Trade opened` lines in the MT terminal.
4. Confirm the trade appears in MT4/MT5 Trade tab.
5. On TradePilot Dashboard, the signal row should show status `DISPATCHED`.

---

## Input reference

| Input | Default | Description |
|-------|---------|-------------|
| `ServerHost` | `api.tradepilot.sidedevelopments.com` | WebSocket server hostname |
| `ServerPort` | `443` | Public secure WebSocket port for MT5 and MT4 |
| `UseSSL` | `true` | Use TLS (`wss://`) |
| `WsPath` | `/ws/ea` | WebSocket endpoint path |
| `ApiKey` | *(empty)* | Your TradePilot API key |
| `LotSize` | `0.01` | Lot size per trade |
| `UseTpCount` | `1` | How many TP levels to open (1–3) |
| `Slippage` | `10` / `3` | Max slippage in points |
| `MagicNumber` | `20260413` | Order magic number for identification |
| `EnableTrading` | `true` | `false` = log incoming commands without trading |
| `ReconnectDelaySec` | `5` | Base delay before reconnect attempt |

---

## Reconnection behaviour

On disconnect the EA waits `ReconnectDelaySec × 2^attempt` seconds before retrying (capped at 10 minutes after 8 failed attempts). The counter resets on successful auth.

## Recompile required (v0.8.0)

The advisors now write the server-supplied `execution_key` into the order
comment. That comment is what the backend uses to map a slave fill back to the
copy order that requested it, so a later close, partial close or SL/TP change on
the master can target the right position.

Open each file in MetaEditor and press F7 to rebuild `.ex5` / `.ex4`:

- `MT5/TradePilot_EA.mq5`
- `MT4/TradePilot_EA.mq4`

Until you do, copying still opens positions correctly, but mirroring a close
falls back to matching on symbol and side rather than an exact ticket.
