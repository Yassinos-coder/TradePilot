# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2026-07-12

### Added

- **Analytics account management** — selected live accounts can now be hidden from the Analytics account selector and excluded from aggregate “All accounts” views without deleting stored records.
- **Permanent account record deletion** — destructive account cleanup action removes stored trades, execution logs, EA status snapshots, user symbol mappings, and the account row after confirmation.

### Changed

- Aggregate analytics, recent trades, and daily P/L now respect hidden-account preferences stored in existing settings metadata, avoiding a required production database migration.
- Analytics export output now uses the current analytics DTO field names for average win/loss and symbol trade counts.
- App TypeScript config now uses the TypeScript 5.x-compatible `ignoreDeprecations` value.

### Fixed

- Browser reloads now restore the authenticated workspace from HttpOnly session cookies instead of forcing Google sign-in again.
- Auth cookies now include a server-side refresh token cookie so expired Supabase access tokens can be renewed without exposing long-lived tokens to frontend JavaScript.

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
