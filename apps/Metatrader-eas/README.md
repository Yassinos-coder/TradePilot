# TradePilot MetaTrader EAs

Expert Advisors for MT5 and MT4 that connect to TradePilot and auto-execute signals.

---

## MT5 — `MT5/TradePilot_EA.mq5`

**Requirements:** MetaTrader 5 build 2265 or later (native socket support — no DLL needed).

### Install

1. Copy `TradePilot_EA.mq5` to:
   ```
   %APPDATA%\MetaQuotes\Terminal\<id>\MQL5\Experts\
   ```
2. Open MetaEditor (F4 in MT5) and compile the file — should show 0 errors.
3. In MT5, open any chart (e.g. XAUUSD H1).
4. Drag the EA onto the chart from the Navigator panel.
5. In the Inputs tab, set:
   - **ApiKey** — your key from the TradePilot dashboard (starts with `tp_`)
   - **LotSize** — e.g. `0.01`
   - **UseTpCount** — number of TPs to open orders for (1–3)
   - **EnableTrading** — set to `false` for dry-run logging only
6. Check **Allow Algo Trading** in the toolbar.
7. Click OK.

### Expected output (Experts tab)

```
[TradePilot] EA initialised — connecting...
[TradePilot] Connecting to tradepilot.yassinecastro.com:443/ws/ea
[TradePilot] -> auth
[TradePilot] Auth success — ready for signals
[TradePilot] <- ping (latency 42 ms)
[TradePilot] <- signal: XAUUSD BUY @ MARKET SL=2010.00000 TP[0]=2030.00000
[TradePilot] Trade opened: ticket #12345 XAUUSD BUY 0.01 SL=2010.00000 TP=2030.00000
```

---

## MT5 — `MT5/TradePilot_ORB_EA.mq5` (standalone ORB strategy)

A fully-autonomous **Opening Range Breakout** EA — no server, no signals. It marks the New York 09:30 opening range, waits for a lower-timeframe candle to *close* outside it, and trades the breakout with an ATR stop and RR take-profit. Multi-symbol from a single chart.

**Requirements:** MetaTrader 5. Native indicators only — no DLL.

### Install

1. Copy `TradePilot_ORB_EA.mq5` to `%APPDATA%\MetaQuotes\Terminal\<id>\MQL5\Experts\`.
2. Open MetaEditor (F4) and compile — **0 errors, 0 warnings**.
3. Attach to **any one chart** (it trades every symbol in `Symbols` regardless of the chart symbol).
4. Enable **Allow Algo Trading**.

### How it works

1. At 09:30 New York, the first `OpeningRangeMinutes` (default 15) form the **opening range** (High/Low incl. wicks).
2. On the confirmation timeframe (M1/M2/M5), the EA waits for a candle to **close** outside the range: close above High → **BUY**, close below Low → **SELL**.
3. **SL** = entry ∓ `ATR × AtrMultiplier`; **TP** = entry ± `SL distance × RiskRewardRatio`.
4. One breakout per direction per day, one trade per symbol, no re-entry until the next NY day. Exits are SL/TP only in v1.

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
| `MaxSpreadPoints` | `50` | Skip entry above this spread (0 = off) |
| `TradeMonday…TradeFriday` | `true` | Allowed weekdays |
| `MagicNumber` / `SlippagePoints` | `20260723` / `20` | Order identity / max deviation |
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

1. Log into TradePilot at `https://tradepilot.yassinecastro.com`
2. On the Dashboard, click **Rotate API Key** to generate a fresh key.
3. Copy the full `tp_xxxxxxxx...` string — it is shown only once after rotation.
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
| `ServerHost` | `tradepilot.yassinecastro.com` | WebSocket server hostname |
| `ServerPort` | `443` | Port (443 = WSS, 80 = WS) |
| `UseSSL` | `true` | Enable TLS |
| `WsPath` | `/ws/ea` | WebSocket endpoint path |
| `ApiKey` | *(empty)* | Your TradePilot API key |
| `LotSize` | `0.01` | Lot size per trade |
| `UseTpCount` | `1` | How many TP levels to open (1–3) |
| `Slippage` | `10` / `3` | Max slippage in points |
| `MagicNumber` | `20260413` | Order magic number for identification |
| `EnableTrading` | `true` | `false` = log signals without trading |
| `ReconnectDelaySec` | `5` | Base delay before reconnect attempt |

---

## Reconnection behaviour

On disconnect the EA waits `ReconnectDelaySec × 2^attempt` seconds before retrying (capped at 10 minutes after 8 failed attempts). The counter resets on successful auth.
