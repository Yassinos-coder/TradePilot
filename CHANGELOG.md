# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Read-only assistant analytics API at `GET /api/assistant/analytics/tradepilot`, protected by `x-tradepilot-analytics-token`, for stable AI-readable TradePilot performance analysis.
- Optional `accountId` query filter for scoped analytics exports while preserving read-only behavior.
- Stable response schema `tradepilot.analytics.read.v1` including generated timestamp, analytics summary, recent trades, and latest account status for Hermes skill consumption.

### Fixed

- Signal parsing now tolerates decorative wrappers around trade labels like `( SL )` and `( TP )`, allowing pending-index entries such as `US30 Buy Limit` to validate and dispatch correctly

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
