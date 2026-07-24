# TradePilot Secure Position Proxy

This document describes the secure API proxy for reading, opening, closing, and modifying MetaTrader positions through the connected TradePilot EA.

## What this feature does

The proxy gives an external caller such as Postman a controlled API surface:

- Read currently known open positions for one MetaTrader account.
- Open a new position through the online EA.
- Close a full position by ticket or all positions for a symbol.
- Partially close a position by ticket or symbol.
- Modify stop-loss and/or take-profit by ticket or symbol.

The server never talks directly to the broker. Commands flow:

1. API caller sends a signed HTTPS request to the TradePilot backend.
2. Backend authenticates the request using a scoped proxy API key and optional HMAC signature.
3. Backend sends a command only to the online EA socket for the requested account.
4. EA executes locally in MetaTrader and reports `command_result`, account status, and trade events back to the backend.

## Security model

### Required key

Set this on the backend:

```env
TRADEPILOT_PROXY_API_KEY=<random 32+ char API key>
```

Every request must include:

```http
x-tradepilot-proxy-key: <TRADEPILOT_PROXY_API_KEY>
```

### Recommended HMAC signing

Set this to force replay-protected request signing:

```env
TRADEPILOT_PROXY_HMAC_SECRET=<random 32+ char HMAC secret>
```

When `TRADEPILOT_PROXY_HMAC_SECRET` is set, every request must include:

```http
x-tradepilot-proxy-timestamp: <unix epoch milliseconds>
x-tradepilot-proxy-nonce: <unique random string per request>
x-tradepilot-proxy-signature: <hex hmac sha256>
```

The signature payload is:

```text
<timestamp>.<nonce>.<sha256(stable-json-body)>
```

Where `stable-json-body` is JSON with sorted object keys and no whitespace. For `GET /position-proxy/positions`, sign `{}`.

Requests are rejected if:

- API key is missing or wrong.
- Timestamp is more than 5 minutes away from server time.
- Nonce was already used within the replay window.
- Signature does not match.

### User binding

The proxy executes for this configured user:

```env
TRADEPILOT_PROXY_USER_ID=<tradepilot user uuid>
```

If omitted, the backend falls back to `TRADEPILOT_ANALYTICS_USER_ID` for Yassine's single-user assistant/ops setup.

### Transport encryption

Production calls must use HTTPS to the backend. The EA socket should run through WSS/TLS in production. API-level HMAC prevents tampering/replay at the HTTP command boundary; TLS protects the request and WebSocket transport in flight.

## Endpoints

Base path:

```text
/api/position-proxy
```

If calling the local Nest server directly:

```text
http://127.0.0.1:4000/api/position-proxy
```

### List open positions

```http
GET /api/position-proxy/positions?accountId=16005208
```

Behavior:

- Requests an EA state sync for that account.
- Returns `trade_executions` rows still marked `OPEN`.
- The MT5 EA now sends a live open-position snapshot during state sync so stale DB rows can be refreshed.

### Open position

```http
POST /api/position-proxy/open
Content-Type: application/json

{
  "accountId": "16005208",
  "symbol": "NZDUSD",
  "side": "BUY",
  "volume": 0.1,
  "entry": "MARKET",
  "entryPrice": null,
  "stopLoss": 0.58391,
  "takeProfit": 0.59000
}
```

Notes:

- `side`: `BUY` or `SELL`.
- `entry`: `MARKET`, `LIMIT`, `STOP`, or `STOP_LIMIT` schema-side. The current MT5 EA executes market or limit semantics; stop/stop-limit require EA execution extension before live use.
- `volume` is sent to the EA and overrides the EA default lot size for this API command.

### Close position

Full close by ticket:

```http
POST /api/position-proxy/close
Content-Type: application/json

{
  "accountId": "16005208",
  "ticket": "4459926110",
  "percent": 100
}
```

Partial close by symbol:

```http
POST /api/position-proxy/close
Content-Type: application/json

{
  "accountId": "16005208",
  "symbol": "NZDUSD",
  "percent": 50
}
```

Rules:

- Provide either `ticket` or `symbol`.
- `percent: 100` sends a full close command.
- `percent < 100` sends a partial close command.

### Modify SL/TP

```http
POST /api/position-proxy/modify
Content-Type: application/json

{
  "accountId": "16005208",
  "ticket": "4459926110",
  "stopLoss": 1.60239,
  "takeProfit": 1.61162
}
```

Rules:

- Provide either `ticket` or `symbol`.
- Provide at least one of `stopLoss` or `takeProfit`.
- Missing side keeps the existing value on the EA.

## Postman HMAC pre-request script

Create environment variables:

- `proxyApiKey`
- `proxyHmacSecret`

Headers:

```text
x-tradepilot-proxy-key: {{proxyApiKey}}
x-tradepilot-proxy-timestamp: {{proxyTimestamp}}
x-tradepilot-proxy-nonce: {{proxyNonce}}
x-tradepilot-proxy-signature: {{proxySignature}}
```

Pre-request script:

```javascript
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
}

const timestamp = String(Date.now());
const nonce = crypto.randomUUID();
const rawBody = pm.request.body && pm.request.body.raw ? pm.request.body.raw : '{}';
const parsedBody = rawBody.trim() ? JSON.parse(rawBody) : {};
const stableBody = stableStringify(parsedBody);
const bodyDigest = CryptoJS.SHA256(stableBody).toString(CryptoJS.enc.Hex);
const canonical = `${timestamp}.${nonce}.${bodyDigest}`;
const signature = CryptoJS.HmacSHA256(canonical, pm.environment.get('proxyHmacSecret')).toString(CryptoJS.enc.Hex);

pm.environment.set('proxyTimestamp', timestamp);
pm.environment.set('proxyNonce', nonce);
pm.environment.set('proxySignature', signature);
```

## Operational notes

- Commands are delivered asynchronously to the EA. The API response means `DELIVERED`, not broker-filled.
- Check `/api/execution/trades`, `/api/execution/logs`, or the `command_result` rows/logs for terminal result confirmation.
- The account must be online in Redis/EA presence. Offline accounts return `503`.
- MT5 EA was updated to support ticket-targeted close/partial-close/modify and live open-position snapshots.
- MT4 EA still needs equivalent runtime changes before MT4 accounts can use the same ticket-targeted behavior.

## Current screenshot reference

The screenshot Yassine provided showed these live positions manually in MetaTrader:

- `NZDUSD BUY 0.10`, entry `0.58391`, current `0.58529`, floating about `+13.80` USD.
- `NZDUSD BUY 0.10`, entry `0.58550`, current `0.58529`, floating about `-2.10` USD.
- `EURCAD BUY 0.10`, entry `1.60444`, current `1.60472`, floating about `+1.99` USD, ticket `4459926110`, SL `1.60239`, TP `1.61162`.

Account metrics in the screenshot:

- Balance: `514.04`
- Equity: `527.73`
- Margin: `46.23`
- Free margin: `481.50`
- Margin level: `1141.53%`
- Floating P/L: `13.69 USD`
