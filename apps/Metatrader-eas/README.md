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
