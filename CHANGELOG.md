# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.1] - 2026-08-15

### Fixed

- **Claude's COT interpretation never rendered** — the positioning cards always fell back to the "AI interpretation is unavailable" notice. Two faults compounded: the request capped output at 900 tokens when a full six-card analysis measures around 1650, and it disabled thinking, which sent the model into a repeat loop that burned the remaining budget on a repeating digit. Every response came back truncated mid-string, so parsing the JSON threw and the endpoint returned a 503. The request now allows 4096 output tokens and uses adaptive thinking at low effort. A response that still hits the cap is reported as an incomplete analysis instead of surfacing as a generic parse failure.
- **Dropped a cache directive that never applied** — the analysis request asked for ephemeral prompt caching, but its prefix sits near 500 tokens, under the 1024-token minimum the model requires, so nothing was ever cached.

### Changed

- **The COT report header names the release you are reading** — it now reads "Report week ending" with the weekday spelled out, confirming at a glance that the snapshot is the CFTC's Tuesday rather than a date shifted by the viewer's timezone. Underneath it, a new "Loaded" line shows the date and time the data was fetched, so a fresh pull is distinguishable from the half-hour cache. The report date stays pinned to UTC while the load time renders in local time with its zone attached.

## [1.4.0] - 2026-08-11

### Removed

- **Economic calendar shelved** — the page now shows a "coming soon" placeholder. The upstream schedule feed carried no `actual` field on any row, so released figures could never appear, and only its current-week endpoint still resolved: the last-week and next-week tabs were serving cached data up to a week old as though it were live. Rather than keep presenting a calendar that could not report results, the feature is parked until it can be rebuilt on a source that publishes them.
- **Economic indicator lookups** — the CPI, PPI and retail-sales history charts are gone with the calendar. They were only reachable from a calendar row, so the Bureau of Labor Statistics, FRED and Census integrations behind them no longer had a consumer. `CENSUS_API_KEY` is no longer read and has been dropped from the environment files.
- **Dead EC2 deploy workflow** — the GitHub Actions job deployed over SSH to a host that no longer exists. Deployment runs through Berth.

### Changed

- **One version across the monorepo** — the root, both apps and all three packages now share a single version number instead of drifting on separate lines, so the version the app reports matches the one in the changelog. Internal `@tradepilot/*` dependency pins were updated alongside it to keep the workspace resolving locally.
- **Deployment docs describe Berth** — the README documented an EC2 host behind Nginx Proxy Manager that no longer exists, including SSH steps and security-group rules. It now describes the actual flow: push to `production`, Berth rebuilds from the Dockerfiles, and its proxy handles TLS.
- **Corrected the MetaTrader connection details** — the README and `PLAN.md` still claimed the EA used plain WebSocket on port 4000 with TLS bypassed. Both EAs have defaulted to `wss://` on port 443 since the secure gateway change, and the setup steps now match.
- **`PLAN.md` brought back in line with the code** — the infrastructure section described the retired EC2 host, its Nginx Proxy Manager chain, a buildx workaround and security-group rules. It now documents the Berth topology. The module, page and table lists were missing everything added since they were written (COT, calculators, open trades, manual trade, assistant analytics, and five database tables), and the duplicated environment-variable dump — the part that had drifted furthest — is replaced by a pointer to `.env.example` so it cannot rot again.
- **One SQL file** — `supabase/schema.sql` replaces `tradepilot-schema-v2.sql` and the four files in `migrations/`, which are deleted. It is idempotent, so it is safe on a fresh database and safe to re-run on a live one. This also closes a trap: `cot_history` existed *only* in a migration and was absent from the schema file, so anyone setting up from the schema alone ended up with the COT feature pointed at a table that did not exist. The v1 archaeology went with it — the Telegram-era table drops, the `users.api_key` carry-over and the signal-era column cleanup were all guarded no-ops against any current database.
- **Added the missing foreign-key indexes** — Postgres indexes primary keys and unique constraints automatically but never foreign keys, and six FK columns had no usable index: `accounts.user_id`, `api_keys.rotated_from_id`, `copy_orders.copier_link_id`, `copy_orders.slave_account_id`, `trade_executions.copy_event_id` and `trade_history_files.user_id`. Every `ON DELETE CASCADE` through them sequential-scanned the child table, which is exactly what deleting an account or resetting a workspace does. `cot_history` also picked up the explicit service-role policy every other table already had, rather than depending on the role's `BYPASSRLS` attribute alone.
- **`check_supabase_from_container.sh` no longer hard-codes the container name** — it takes an optional argument and lists the running containers when the name does not match, instead of failing opaquely.

## [1.3.0] - 2026-08-11

### Added

- **Calculators workspace** — new authenticated sidebar tab with trader calculators for lot sizing, pip value/P&L, compounding with Monte Carlo paths, risk-of-ruin simulation, and margin/leverage. Instrument defaults cover FX, metals, indices, crypto and energy CFDs while keeping broker-specific contract size, pip size and conversion fields editable.
- **Lot-size templates** — lot sizing can save reusable stop-loss/risk/contract presets to browser storage so traders can reuse personal/prop-account risk settings without re-entering them. Account balance stays outside the template because it changes over time.
- **Full instrument coverage in the calculators** — the instrument list now spans every major and G10 cross plus the commonly offered exotic and regional pairs, additional metals (platinum, palladium, gold priced in EUR/GBP/JPY), and a much wider index set including the Russell 2000, VIX, and the main European and Asian cash indices. Each instrument carries its own contract size, pip size and quote-to-USD conversion, so results stay correct on non-USD-quoted symbols.
- **Searchable instrument picker** — instruments can be filtered by name or symbol instead of scrolled, which the expanded list makes necessary.

### Changed

- **Desktop sidebar is collapsible** — users can collapse the left navigation to icons, reopen it from the sidebar header toggle, or click the collapsed rail to expand it again.

## [1.2.0] - 2026-08-01

### Added

- **TradingView London Session Strategy** — new Pine v6 strategy implementing the "time before price" London model. A 90-minute window from 03:00 New York; the range that existed before it, defined either as a session window (Asian range by default) or as the previous completed hourly candle — the "2am sets it, 3am manipulates it, 4am expands" framing, read non-repainting; one side of that range swept inside the window; and a displacement candle closing through the extreme of a run of opposing-close candles with a body of at least 0.8 ATR. Entry is market-on-displacement or a limit into the fair value gap or order block the displacement left, stops sit beyond the sweep extreme, and targets are the 50% or the far side of the dealing range redrawn from that extreme. Optional SMT divergence against a correlated symbol. Defaults are tuned for FX on 5m and the script blocks itself above 15m, where a 90-minute window is too few bars for a sweep, a displacement and an entry to fit.
- **Per-day funnel on the London dashboard** — windows seen, then days that swept, then days that displaced, then days that traded. "Why did today produce nothing?" has four possible answers and the Strategy Tester can only ever show the last one; the first big drop in that chain names the stage that is rejecting setups and the setting that governs it.
- **TradingView Dynamic VWAP Strategy** — new Pine v6 strategy derived from Chen (2024), *A Review of VWAP Trading Algorithms*. The paper's volume decomposition is kept but its input is swapped: on a CFD the volume field is the broker's own tick count, so the activity proxy defaults to true range, which makes the benchmark a property of price rather than of your broker. The learned per-slot activity profile gates trading until it has seen enough sessions, and the surprise residual switches between a reversion leg (transient impact, fade back to the benchmark) and a momentum leg (permanent impact, go with the break), with the two legs deliberately on separate bands. 100/200 EMA regime filter, neither drawn. Defaults for NZDUSD on 2H with a weekly anchor.

### Changed

- TradingView documentation now covers both new strategies, including the London model's RR-versus-target interaction (the equilibrium target implies 1.2–1.6R, so the 1:2 minimum the model quotes verbally only holds against the range extreme), its notional-cap arithmetic (a 3-pip stop needs ~33× equity for a real 1% risk, so the 3× that suits the 2H strategies silently cuts realised risk to ~0.09%), and the VWAP script's parameter optimisation protocol.

## [1.1.0] - 2026-07-30

### Added

- **Economic calendar** — new News tab reading the Forex Factory public weekly feed, grouped by day with the current day highlighted, filterable by impact and currency, showing actual against forecast and previous. Times render in the viewer's timezone. Cached server-side for 10 minutes so the upstream feed is not hammered.
- **Account names** — every connected terminal can be given a display name, edited inline on the Accounts page. The name is yours and survives EA reconnects; the broker's own account name stays visible underneath.
- **Reset connected accounts** — a danger-zone action in Settings → Security that clears every account along with its trades, logs, snapshots, symbol maps, imported statements, copier links and copy history. The terminals are untouched, so each EA re-registers on its next heartbeat and the live data rebuilds itself.
- **Device-scoped sessions** — the browser mints a stable device id and sends it with every request, so signing in again from the same browser refreshes one row instead of adding another. Active sessions are now a table showing device, IP, sign-in count and last activity, with the current device marked. Rows without a device id fold together on IP plus user agent.

### Changed

- **Accounts page rebuilt** — the three telemetry cards collapse into a single strip, the account list is a compact selectable row per terminal, and the status history is collapsed by default and shows only snapshots where something actually changed. The EA reports every 10 seconds whether or not anything moved, so the old table was mostly duplicate rows.
- **Country is a dropdown** — a full ISO 3166-1 list replaces the free-text two-letter code field.
- **Analytics is copier-aware** — the account selector sorts master first, then slaves, labels each with its role, and the manage panel shows a role badge.

### Fixed

- **Form fields sat at different heights in the same row** — `Input` and `Select` render label, field and optional hint as grid rows, and in a two-column layout the cell stretches to the tallest row. A field without a hint had its rows pushed apart, dropping its input below its neighbour. Both now pack their rows to the top.

### Performance

- **Analytics aggregates are cached** — the analytics summary and the calendar daily summary read through a 45-second Redis cache keyed by user, account and date range. `/dashboard/overview` recomputed the full closed-trade history on every call, so polling mapped one-to-one onto Supabase reads; it no longer does. A cache failure falls through to a live query.
- **Polling intervals cut across the app** — dashboard overview 10s → 60s, dashboard trade history 1000 rows every 15s → 300 rows every 120s, analytics 15s → manual refresh only, copier overview 15s → 30s, copier feed 10s → 20s, accounts 10s → 30s, open trades 10s/8s → 20s. Query defaults now hold data fresh for 60s and stop polling entirely in a background tab.

### Migration

Re-run `supabase/tradepilot-schema-v2.sql`. It is idempotent; this pass adds
`accounts.display_name`, `user_sessions.device_id` with a partial unique index on
`(user_id, device_id)`, and `trade_executions.entry_type`.

## [1.0.0] - 2026-07-30

TradePilot is now a multi-account trade copier. The Telegram signal-routing half
of the product is gone; the copy source is the master account's own trade feed.

### Added

- **Master to slave trade copying** — each user marks one connected MetaTrader account as `MASTER`; every open, close, partial close and SL/TP change on it is mirrored to the accounts linked as slaves. The master EA's `trade_event` is the trigger, so nothing is parsed or guessed. Copies are deduped per master ticket and action, so a resent transaction cannot double-fire.
- **Per-link risk parameters** — every master → slave route carries its own configuration, so two slaves off one master can run completely different risk: sizing mode (`MULTIPLIER`, `FIXED_LOT`, `BALANCE_RATIO`, `RISK_PERCENT`), min/max lot clamp, max open positions, daily loss and drawdown ceilings, equity floor, max spread and slippage, staleness cutoff, reverse copy, per-action copy toggles, and symbol allowlist/blocklist with broker prefix/suffix override.
- **Risk gate that blocks rather than warns** — limits are enforced before a copy is dispatched, and every rejection is recorded on the copy order with its reason. Closes are deliberately never blocked, so a limit can't strand a slave holding a position the master has already exited.
- **Master ↔ slave ticket map** — the slave writes the server's execution key into its order comment, which the backend reads back to link the fill to its copy order. That mapping is how a later close or modify on the master targets the exact mirrored position.
- **API keys with two kinds and real rotation** — `api_keys` stores EA keys (MetaTrader terminals) and REST keys (HTTP trade API) as SHA-256 hashes with a display prefix; the secret is shown once and is not recoverable. Rotation issues a successor and leaves the predecessor valid for a grace window (24h default) so a live EA session isn't cut off mid-trade. Revocation is immediate.
- **Allow trade opening through API** — a per-user setting gating `POST /v1/trades/open`. Closing and modifying are intentionally not gated by it, so withdrawing the permission can never leave a caller unable to shut down exposure it already has.
- **Optional HMAC request signing per REST key** — timestamp, single-use nonce and a signature over the canonical body, which stops a captured request being replayed.
- **Trade Copier page** — master selector, one card per slave link with its risk summary and a full parameter drawer, and a live feed showing each master action alongside how every link handled it.
- **Design token layer** — `styles.css` now defines the whole palette as CSS variables consumed through Tailwind v4 `@theme inline`, so light and dark both resolve from one source and a palette change is a single edit. Recolored to the product reference: charcoal sidebar, light canvas, white cards, teal accent. Light is now the default theme.

### Changed

- **Settings rebuilt** into five tabs — My Account, Security & Sign-in, API & Keys, Copier Defaults, Notifications — with a hero band, an underlined tab strip and segmented sub-sections.
- **Analytics endpoints moved** from `/api/execution/*` to `/api/analytics/*`. The calculations are unchanged; the read side was lifted out of the old `ExecutionService` (2235 lines, half of which was the signal dispatcher) into its own module.
- **EA authentication** resolves `{ type: "auth", apiKey }` by hash lookup against `api_keys` instead of a plaintext column comparison, and honours expiry and revocation.
- **Account reconnects no longer clobber role** — the EA upsert leaves `role` alone, so a master stays a master across restarts.
- **Trade-type analytics breakdown** is now by side only (`Market Buy` / `Market Sell`). The requested entry type came from the signals table and is no longer persisted.
- MetaTrader EAs write the execution key as the order comment when the server supplies one, falling back to the previous `TradePilot-N` label otherwise. **`.ex5` / `.ex4` must be recompiled in MetaEditor** — until then, copying opens positions correctly but close mirroring falls back to symbol-and-side matching.

### Removed

- **Telegram, end to end** — the MTProto session, phone/OTP login flow, channel sync, the 30-second backfill loop, the encrypted session store, the log-only bot notification provider, and all five `TELEGRAM_*` environment variables.
- **The signal pipeline** — regex parser, OpenAI parsing fallback, signal classifier, the BullMQ queue and worker, and the `signals` table. `OPENAI_API_KEY` is retained but now powers only the analytics AI coach.
- **Bull Board** at `/admin/queues`, which had no authentication and was publicly proxied by the frontend nginx config.
- **The cross-user copier** — `copier_programs`, `copier_invite_codes`, `follower_devices`, invite codes, anonymous `tpfd_` device tokens and the unauthenticated `POST /trade-copier/followers/join` endpoint. Copying is now scoped to a single user's own accounts.
- **`position-proxy`** and its global env-based API key, superseded by the REST trade API with per-user keys.
- `users.api_key`, `POST /users/api-key/regenerate`, and the signal-era `settings` columns (`mode`, `allowed_symbols`, and the global per-trade risk fields now owned by each link).
- Dependencies: `telegram` (gramjs), `bullmq`, `@nestjs/bullmq`, `@bull-board/api`, `@bull-board/express`.

### Fixed

- **Follower token binding never rejected a mismatch** — `validateFollowerTokenBinding` returns an object, so `if (!matchesBinding)` was always false. Moot now that the follower system is removed, but it was a live auth bypass in the unreleased path.
- **Drawer backdrop was `lg:hidden`**, so clicking outside a drawer did nothing on desktop. Escape now closes drawers and modals too.

### Security

- API keys are no longer readable from the database — only a SHA-256 hash and an 11-character display prefix are stored.
- The unauthenticated Bull Board queue dashboard is no longer exposed.

### Migration

Apply `supabase/tradepilot-schema-v2.sql` in the Supabase SQL editor. It is
re-runnable and works on both a fresh database and an existing v1 one.

It **drops** `signals`, `telegram_connections`, `telegram_channels`,
`copier_programs`, `copier_invite_codes` and `follower_devices`. Analytics data
(`trade_executions`, `ea_account_status_snapshots`, `trade_history_files`,
`user_symbols`) is preserved, and existing `users.api_key` values are hashed into
`api_keys` rows first so terminals already in the field keep authenticating.

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
