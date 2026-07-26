# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] - 2026-07-26

### Added

- **Open Trades workspace** — new authenticated sidebar tab for manually sending MARKET, LIMIT, and STOP orders to a connected EA, with account selection, order preview, broker position snapshots, and latest execution results.
- **STOP order support in the position proxy path** — the shared/API contract now validates pending-order entry prices and the MT5/MT4 EAs route STOP orders to Buy Stop / Sell Stop broker commands. STOP_LIMIT remains explicitly rejected until it is implemented safely end-to-end.
- **Half notches on the ATR projection ladder** — optional `-0.5` and `+0.5` levels in both the indicator and the strategy, for maps drawn in half-weekly-ATR steps. Off by default in both; on the strategy it also halves the room to the next target, so it needs a fresh backtest before use.

### Fixed

- **Weekly anchor and ATR skipped the week that had just finished** — the projection map read one week back from the weekly bar containing the current chart bar, which is only correct while that week is still forming. From Friday's close onward, and all weekend, the completed week was ignored and its predecessor used instead: on XAUUSD the anchor read 4018.22 on a 256.08 ATR where the correct values were 4052.79 and 250.88, putting every zone a full week out of place. The anchor now locks in when a week closes and carries unchanged through the next one, resolving identically on history and in real time. Affects both the indicator and the strategy, so previous strategy backtests need re-running.
- **4H ATR equilibrium had the same off-by-one** — zone height was averaging the 4H ATR window of the week before last whenever the current week had already closed, and now uses the completed week's window.
- Weekly bias inputs are read from confirmed weekly bars, so the structure verdict changes only on a weekly close instead of drifting mid-week, and the three-week structure break compares against the three weeks preceding the anchor week.

## [0.6.0] - 2026-07-26

### Added

- **TradingView ATR Projection Strategy** — new Pine v6 strategy trades the projection map the indicator draws: bias-aligned entries when a bar touches a weekly-ATR notch and a later close clears it, stops at the zone's protected edge plus an ATR buffer, targets at the next notch. Defaults are tuned for the 2H chart (arm expiry 15 bars, cooldown 6 bars, 0.15-ATR confirmation buffer, minimum 1.5 RR, 3 trades per week).
- **MA and momentum confirmation filters** — entries now require price on the correct side of a moving average (200 by default, chart or higher timeframe, optional slope requirement) and momentum agreement via RSI midline or MACD histogram. Neither is plotted; the dashboard's Filters row reports which one blocked a signal.
- **Position notional cap** — risk-% sizing is capped at a configurable multiple of equity, so oversized forex orders are reduced instead of being silently rejected by the tester for insufficient margin. The dashboard flags capped orders, whose realised risk sits below the configured target.
- **Loss cooldown and optional breakeven stop** — a configurable bar cooldown after a losing exit stops the same notch re-arming into the chop that just stopped it out, and the stop can optionally move to breakeven at a chosen R multiple.
- **TradingView ATR Projection Levels indicator** — new Pine v6 indicator automates Yassine's weekly ATR projection workflow with manual/auto trend detection, weekly ATR fib-style zones, 4H ATR-equilibrium zone height, chart-timeframe EMAs, optional bias background tint, near-price zone limiting, and a ranging-market status watermark.
- **Secure Position Proxy API** — new API-key/HMAC-protected `/api/position-proxy/*` endpoints let authorized tools such as Postman read open positions and deliver open/close/partial-close/SL-TP modify commands to a connected EA.
- **MT5 live open-position snapshots** — state sync now reports currently open MT5 positions so backend reads are not limited to stale historical trade events.
- **Analytics account management** — selected live accounts can now be hidden from the Analytics account selector and excluded from aggregate “All accounts” views without deleting stored records.
- **Permanent account record deletion** — destructive account cleanup action removes stored trades, execution logs, EA status snapshots, user symbol mappings, and the account row after confirmation.

### Changed

- Aggregate analytics, recent trades, and daily P/L now respect hidden-account preferences stored in existing settings metadata, avoiding a required production database migration.
- Analytics export output now uses the current analytics DTO field names for average win/loss and symbol trade counts.
- App TypeScript config now uses the TypeScript 5.x-compatible `ignoreDeprecations` value.
- TradingView documentation now covers the projection indicator and strategy, including the 2H default rationale and the forex sizing caveat that causes rejected orders to look like missing signals.

### Removed

- **ORB scripts** — the MT5 opening-range-breakout Expert Advisor and its TradingView strategy port have been dropped; the ATR projection map is now the strategy line of work.
- Daily refreshed dashed levels in the projection indicator, replaced by chart-timeframe EMAs and optional near-price zone limiting.
- `package-lock.json` is no longer tracked, and is now ignored.

### Fixed

- MT5 EA WebSocket sessions now tolerate non-fatal post-auth server errors, answer control-frame pings with masked pong frames, and use a longer configurable heartbeat timeout to avoid connect/disconnect loops.
- Position-proxy command results can now be stored even when a ticket-targeted close/modify has no symbol in the EA response.
- Browser reloads now restore the authenticated workspace from HttpOnly session cookies instead of forcing Google sign-in again.
- OAuth callback now re-initializes the app auth store after creating the backend session cookie, preventing an immediate redirect back to sign-in on refresh/navigation.
- Auth cookies now include a server-side refresh token cookie so expired or missing Supabase access-token cookies can be renewed without exposing long-lived tokens to frontend JavaScript.

## [0.5.2] - 2026-07-12

### Fixed

- Supabase auth-state events with a null in-memory session now rehydrate from the backend HttpOnly cookie session instead of clearing a valid login on page reload or version-refresh reload.
- Web app shell and version manifest now send no-cache headers, while hashed assets remain immutable, so the update button reliably loads the newest bundle.

## [0.5.1] - 2026-07-12

### Fixed

- Released app version bump for the browser session persistence fix.

## [0.5.0] - 2026-07-03

### Added

- **Trading Calendar Dashboard** — month-view calendar with color-coded day squares (green/profit, red/loss, grey/no trades), `◄ Month Year ►` navigation, hover tooltips with daily stats, and click-to-open day detail drawer showing trade history filtered by date
- **Dashboard summary cards** — Monthly Net Total, Annual Net Total, and live Unrealized P&L (equity − balance) with open position count refreshing every 10 s
- **Month Statistics panel** — win-rate SVG ring, best/worst day, best/worst trade, and total trade count for the visible calendar month
- **Trade History table on Dashboard** — paginated at 10 rows/page with Status, Symbol, and Account filter selects; columns: Symbol, Side, Volume, Entry, Exit, P&L, Status, Account, Opened, Closed
- **Trade Copier page** — all execution monitoring moved here: master auto-copy toggle, trading engine grid (6 status items), connected accounts table, EA API key card, last Telegram message card, signal history table with filter/dispatch/delete, execution logs feed, failsafe alert — consolidated above the existing community copier programs section
- **Analytics time filter** — segmented tab control (Today / This Week / This Month / This Year / All History) that re-queries backend with `startDate`/`endDate` params and scopes all metrics
- **Analytics export button** — dropdown with Copy as Text, Copy as JSON, Download as Text, Download as JSON
- **AI Coach panel on Analytics** — sends full analytics JSON to GPT-4.1 and displays a 5-line performance assessment; cached for 5 minutes, rendered above the account selector
- **`GET /execution/daily-summary`** backend endpoint with `startDate`, `endDate`, `accountId` params; groups closed trades by date and returns per-day net profit, trade count, W/L, win rate, best/worst trade, and symbols list
- **`GET /execution/ai-analysis`** backend endpoint that calls OpenAI GPT-4.1 with a slim analytics payload and returns a 5-line coaching analysis
- **`Tooltip.tsx`** UI primitive — hover tooltip with Framer Motion fade, top/bottom placement
- **`Drawer.tsx`** UI primitive — right-side slide-in panel with spring animation and backdrop

### Changed

- Dashboard is now a pure performance view; all execution-monitoring widgets removed and consolidated into Trade Copier
- Analytics endpoint now accepts `startDate` and `endDate` query params for time-scoped metric computation
- Settings page changed to full-width single-column layout (sticky sidebar navigation removed)
- Trade history fetch limit raised to 1 000 records on the dashboard; dashboard trades refresh every 15 s
- App version display now reads from `apps/App/package.json` via Vite build-time injection

### Fixed

- Added `@` → `src/` path alias to `vite.config.ts` and `"paths": {"@/*": ["src/*"]}` to `tsconfig.json`; resolves Rollup build failure for all `@/` imports in new pages
- `tsconfig.json` `baseUrl` deprecation suppressed with `"ignoreDeprecations": "6.0"`
- Read-only assistant analytics API at `GET /api/assistant/analytics/tradepilot`, protected by `x-tradepilot-analytics-token`
- Event-driven notification pipeline for execution and account lifecycle alerts, with delivery gated by per-user channel and event preferences
- Build-version manifest and in-app update prompt so deployed clients detect fresh releases
- Trade history imports on the Analytics page supporting CSV/TXT/HTML exports with Supabase Storage persistence
- Signal parsing now tolerates decorative wrappers around trade labels like `( SL )` and `( TP )`

## [0.4.0] - 2026-05-15

### Added

- Master execution toggle (`auto_copy_enabled`) with dashboard sticky control and server-side execution guard
- Trade lifecycle direction model persisted on executions: `opening_order_type`, `position_direction`, and `close_reason`
- Signal classification system (`SIGNAL`, `MANAGEMENT`, `NOISE`) with history filtering and soft-delete (`deleted_at`)
- Consolidated settings experience with tabs: Profile, Security, Telegram, Notifications, Trading, Billing
- Profile/security APIs for updating name/phone/email, email verification, password change, session listing, and logout-all-devices
- Notification subsystem with provider abstraction (`NotificationProvider`) and providers for Email, Telegram, and WhatsApp (future-ready stub)
- SMTP-ready email architecture using environment configuration (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`) and template-based emails
- Public launch surface and legal pages: `/`, `/pricing`, `/terms`, `/privacy`, `/refund`
- Trading engine observability card with auto-copy status, Telegram connectivity, connected account count, risk status, and last signal/trade timestamps
- Configurable risk controls: max daily loss %, max simultaneous trades, max trades/day, low-margin threshold
- Failsafe execution pauses for EA disconnected, Telegram disconnected, low margin, and unresolved symbol scenarios
- Manual **Refresh** button on the Analytics page with spinning icon animation, "Updated X ago" / "Syncing…" status label, and staggered fade-in entry animations on High Signal Metrics cards

### Changed

- Analytics calculations now classify directional performance by lifecycle position direction (LONG/SHORT) instead of close-side transaction action
- Signal pipeline now keeps ingesting and parsing when auto-copy is disabled while blocking only execution dispatch
- Symbol control model refactored to exclusion-first behavior (all symbols enabled by default; execution skips only excluded symbols)
- Dashboard signal table now defaults to actionable flow (Signals + Management), with explicit filter options for All/Signals/Management/Noise
- Status taxonomy expanded for signal and execution lifecycle visibility (`AUTO_COPY_DISABLED`, `BLOCKED`, `IGNORED`, `SYMBOL_UNRESOLVED`, `RISK_LIMIT_HIT`, `FAILSAFE_TRIGGERED`)
- Routing refactored to separate public pages from authenticated app routes (`/app/*`)
- Analytics page `isFetching` state now tracked across all three queries; refresh spinner activates on both auto-refresh and manual refresh

### Fixed

- Corrected long/short analytics misclassification where profitable BUY trades could be counted as SHORT on close
- Stabilized advanced analytics metrics (Sharpe, Sortino, CAGR, Calmar, Sterling, annualized volatility) with data sufficiency gating and defensive clamping
- Prevented annualization explosions and divide-by-near-zero artifacts in risk-adjusted metrics for small sample sizes
- Improved execution safety by hard-blocking dispatch when master toggle is disabled while preserving telemetry and analytics continuity

## [0.3.0] - 2026-04-30

### Added

- cTrader/Spotware cBot EA (`apps/Metatrader-eas/spotware/TradePilot_cBot.cs`) — C# Expert Advisor for the cTrader platform using `System.Net.WebSockets`, implementing the identical JSON protocol as the MT4/MT5 EAs (auth, ping/pong, account status, symbols, trade events, signal execution, partial close, close all, move SL)
- `usePagination` hook for generic client-side pagination with automatic page reset when data changes
- `Pagination` component with prev/next controls, page number buttons, smart ellipsis for large page counts, and an item range counter

### Changed

- Dashboard Connected Accounts table, Recent Signals, Execution Logs, and Recent Trades lists are now paginated (10 / 5 / 5 / 5 items per page respectively)
- Analytics Symbol Breakdown table and Trade History table are now paginated (15 / 25 items per page)
- Trade history fetch limit raised from 200 to 500 records
- Connected Accounts empty state copy updated to mention cTrader alongside MT4/MT5

## [0.2.1] - 2026-04-20

### Fixed

- Dispatch acknowledgement race condition where the server could publish a signal before subscribing to its ACK channel, causing false `DISPATCH_TIMEOUT` retries
- AI parsing fallback now supports explicit `NO_SIGNAL` output to avoid forcing non-instructional Telegram chatter into actionable trade commands
- Added defensive validation to reject AI-parsed actions that omit a symbol

## [0.2.0] - 2026-04-19

### Added

- GitHub Actions auto-deploy workflow that triggers on pushes to the production branch
- Manual trade dispatch button and modal for signals in `EA_OFFLINE` state or already validated
- Compiled MT5 EA binary (`TradePilot_EA.ex5`) for direct broker deployment
- Hardened production trading pipeline with improved execution guards and signal validation
- AI-powered signal parsing service for structured trade extraction from Telegram messages
- Analytics page for trade performance visualisation
- Symbol mapping package with `deriveBaseSymbol` for normalised instrument resolution
- Supabase schema SQL file for reproducible database provisioning

### Changed

- MT4 and MT5 EA source updated with refined WS reconnect logic and heartbeat handling
- README updated to reflect full production status and deployment architecture
- Dashboard, Accounts, and Auth pages refactored with improved layout and state management

### Fixed

- `deriveBaseSymbol` no longer uses `includes()` to prevent false-positive symbol matches
- Account auto-select and default LLM model not persisting correctly in settings
- Backend Docker entrypoint misaligned with Linux deployment paths
- Backend port 4000 not exposed, blocking direct EA WebSocket connections
- EA WebSocket handshake timeout increased to 4 s and heartbeat timeout raised to 35 s to reduce spurious disconnects
- Legacy signal `parsedData` fields failing new entry schema now parsed safely to prevent dashboard 500 errors
