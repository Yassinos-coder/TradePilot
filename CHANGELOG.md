# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.7.0] - 2026-09-26

### Added

- **RiskGuard EA** — a new standalone MT5 Expert Advisor with an on-chart position-size calculator (percent or money risk, pip or percent stop loss) and a daily-loss / overall-equity-loss guard that auto-closes losing positions and blocks new trades once tripped. Fully self-contained, no server or other EA dependency.

## [2.6.0] - 2026-09-25

### Added

- **Market Structure Legs** — the TradingView ATR Projection Levels indicator now plots confirmed swing legs directly on the chart, tagging each pivot Higher High / Higher Low / Lower High / Lower Low. Its own settings group covers leg sensitivity (depth, deviation, backstep), a repaint toggle, line and label colors/sizes/transparency, and an independent background tint, plus alerts on new pivots and direction flips. This is a leg-based structural read, distinct from the indicator's existing MTF MA-vote watermark.

### Removed

- **TradePilot ATR Excursion Strategy and TradePilot Dynamic Levels** — both TradingView Pine scripts removed from `apps/TradingView/`.

## [2.5.0] - 2026-09-18

### Added

- Dashboard shows a fourth overview card, "Active Session," displaying the current FX trading session(s) (Sydney, Asian/Tokyo, London, New York) by UTC time, each with its own text color. Updates automatically every minute and shows overlapping sessions together.

## [2.4.2] - 2026-09-18

### Added

- Permanent API-key deletion alongside revocation, with confirmation and account/trade history preserved.

### Fixed

- Revoking or deleting an API key disconnects its authenticated EA sessions across backend instances. Active connections revalidate keys on messages, commands, and heartbeats, including expiry and direct database deletion.
- Browser session refresh and password verification use isolated Supabase clients so backend telemetry and account queries retain service-role access.

## [2.4.1] - 2026-09-17

### Fixed

- Copier account lists refresh after EA reconnection and report loading failures instead of saying no accounts are connected.
- Copier and dashboard copy totals count slave orders instead of master events. The activity feed shows the master event time, with the receipt time available on hover.
- Release versions are aligned at 2.4.1. The updater distinguishes a new release from another build of the same version and clears an obsolete update notice when the deployed build matches the running app.

### Changed

- Analytics coaching and COT interpretation use NVIDIA Nemotron instead of Claude, configured through `NVIDIA_API_KEY` and `NVIDIA_MODEL`.

## [2.4.0] - 2026-09-17

### Fixed

- Current balance, equity, floating P/L, and account growth now read current account state instead of an old snapshot or cached analytics result. Account lists and copier risk checks use the same current-state table.
- Analytics paginate account history and closed trades past Supabase's row cap, fixing totals and balances that stopped updating after the first page.

### Changed

- Account telemetry updates one current-state row per account and stores five-minute history buckets instead of inserting a snapshot every ten seconds. Buckets preserve opening/closing values, equity minima/maxima, maximum reported drawdown, and sample counts.
- Background retention compacts five-minute history older than 30 days into hourly summaries and hourly history older than 365 days into daily summaries. Legacy snapshots are compacted transactionally in bounded batches; daily summaries and trade records are retained.
- Account reports no longer create a duplicate execution-log entry on every update. Existing execution logs remain intact.
- Root, frontend, backend, shared packages, and internal dependency pins are aligned at 2.4.0.

### Deployment

- Apply `supabase/account-status-upgrade.sql` or the updated full schema before deploying the backend. The upgrade backfills current account state; the backend subsequently compacts history. No EA changes are required.
- Added regression checks for live balances over cached analytics, pagination, legacy backfill, bucket extrema, retention tiers, and database permissions.

## [2.3.0] - 2026-08-21

### Added

- **New "ATR Excursion" strategy** (`apps/TradingView/TradePilot_ATR_Excursion_Strategy.pine`) — a backtestable 1H/2H day-trading strategy built on the ATR Projection Levels primitives, but with the weekly grid split by job rather than used as the trade frame: weekly ATR becomes the entry *gate*, the 4H ATR zone becomes the location and the risk unit, and targets default to R multiples so a 1H position is not asked to hold for a multi-day `+2 W-ATR` excursion. `Target Mode` switches to the notch ladder to test whether those notches are reachable inside a day-trading holding period at all. Entry is sweep-and-reclaim on a discount notch (0 / -0.5 / -1.0 W-ATR against the bias) rather than a resting limit: a bar must trade into the zone, then close back through the reclaim level with a with-trend body inside a bounded window, which is also what defines the reaction extreme the stop hides behind. Risk is rejected outright when it falls outside sane W-ATR bounds, position size is fixed-fractional off that stop, and exits cover T1 scale-out, breakeven, an optional zone-height trail, bias-flip invalidation, a max-bars cap, and flat-before-weekend.

- **Weekly excursion gates** — the filter the indicator cannot express. `Max Week Spent` blocks entries once the week has already travelled a set distance in the trade direction, read from the running weekly *maximum* rather than the current print: a week that ran +1.5 W-ATR on Monday and drifted back to its origin by Wednesday still passes a discount-zone test, but the range budget that would pay the trade is gone. `Max Week Adverse` blocks the mirror case, where a full average weekly range has already gone against structure and the "discount" is structure breaking. `Max Current Premium` stops the top of notch 0's zone being bought in a stretched tape.

- **Excursion census table** — measures, per symbol, what share of weeks actually reach 0.25 through 2.0 W-ATR in the structure direction and against it, plus the conditional the strategy bets on: of weeks that dipped into an entry notch, how many then reached the T1 notch. Measured on raw daily structure so filter settings do not contaminate it. If the conditional is not comfortably above the unconditional, the pullback location adds no information on that instrument. Per-notch T1/T2 hit rates are tracked at position level rather than per closed trade, since a scale-out produces two closed trades from one decision.

- **Zone height cap** — the 4H ATR equilibrium is the midpoint of the *extremes* of 4H ATR across a week, not an average, so a single volatility spike widens it for the whole following week. Acceptable as an order-placement tolerance, noisy as a risk unit; the cap bounds it in weekly ATR terms.

### Changed

- **Structure and MA votes are now read non-repainting** in the strategy. The indicator reads daily structure with `lookahead_off`, which develops intraday in real time but only appears at the daily close on history — an asymmetry that silently flatters a backtest. The structure engine is now parameterised on `h`/`l`/`c` and fed `high[1]`/`low[1]`/`close[1]` inside the HTF context under `lookahead_on`, so the value is the last fully closed structure bar, identical live and historical. Every MA vote gets the same treatment via a source-and-comparison-price signature. The weekly anchor keeps the indicator's `weekDone` construction so levels land exactly on the indicator's, and entries are blocked on the `weekDone` bar itself so a freshly rolled anchor cannot arm a setup on the week's last bar.

## [2.2.0] - 2026-08-21

### Added

- **New "AYOUB LEVELS" indicator** (`apps/TradingView/TradePilot_Dynamic_Levels.pine`) — ATR Fibonacci zones over a selectable HTF/LTF pair (Weekly+4H, Daily+1H, Monthly+Daily). Unlike the projection ladder it anchors on the **current** HTF candle rather than the last completed one, placing a fib of length `ATR(14)` at that candle's close so level 0 sits at `close + atrHtf` and level 2 at `close - atrHtf`. Zone thickness comes from the midpoint of the LTF ATR's high/low range measured over the same HTF window, and the reference candle is detected from the chart's bar position so it behaves identically live and in bar replay.

- **Anchor mode on the ATR projection ladder** — `Confirmed Close` keeps the existing behaviour, hanging the grid off the last finished weekly close so it stays put all week as a static support/resistance grid. `Live Close` re-centres on current price every tick, turning the notches into an ATR excursion envelope for targets and stops. Notch spacing and zone thickness still derive from the completed week in both modes, so only the anchor moves and nothing jitters. Live levels are labelled `L`, confirmed ones `W`.

- **Auditable structure inputs** — `Structure Timeframe` (daily by default) and `Swing Strength` control where and how the bias is read, `Require Weekly MA Agreement` optionally demands the weekly MA vote agree before taking a side, and `Show Structure Swings` plots the two reference swings a close must break, so an Auto reading can be checked against the chart. The swing opposing the current bias is the invalidation level.

### Changed

- **Auto bias now reads swing structure instead of a weekly breakout trigger** — the old filter asked whether the weekly close had just cleared the prior 3-week range, which is an expansion *event* rather than a *state*, so an obvious uptrend printed "Ranging" on every pullback and inside week. Bias now comes from an alternating HH/HL/LH/LL zigzag read on its own timeframe while the projection grid stays weekly, and the break is taken live: closing through the last Lower High *is* the higher high, and the bias holds until the opposite reference gives way. Consecutive same-side pivots are collapsed to the extreme one, without which "the last two pivot highs" can be two points on the same leg and comparing them says nothing. Comparing only confirmed pivots was rejected because a pivot high needs `Swing Strength` bars of lower highs to exist at all, so mid-impulse the newest confirmed high is still the pre-impulse one — NZDUSD in Aug 2026 read mixed at 0.59788 against a last confirmed swing high of 0.59061 while the chart was vertical. Weekly MA agreement is now opt-in rather than mandatory. Nothing looks ahead: pivots are read only once confirmed, and a break requires a close.

- **Ranging markets behave differently per anchor** — the confirmed-close grid still hides itself when there is no direction to sign the labels with, while the live envelope stays on screen and labels upward, since an excursion range is useful either way.

### Fixed

- **Moving averages with no value yet were counted as bear votes** — the MA trend score used `not na(ma) and close > ma ? 1 : -1`, which returns `-1` for an MA that simply had not warmed up rather than excluding it. On any timeframe too young for the 100/200 lengths this quietly dragged the entire vote bearish. Unset averages now abstain instead of voting.

### Removed

- The weekly `ta.highest(high, 3)` / `ta.lowest(low, 3)` structure request, redundant now that bias comes from swing structure.

## [2.1.0] - 2026-08-18

### Added

- **Copier links now auto-match symbols the moment an account is added** — linking a slave, promoting a master, and an EA simply reconnecting all now compare the master's known instruments against its counterpart's live broker symbol list (`matchAccountSymbols` in `packages/trading/src/symbols.ts`, built on the existing `resolveBrokerSymbol`/`deriveBaseSymbol` alias and suffix logic). Previously this only ran lazily, per trade, at dispatch time — a brand-new slave with no reported symbols yet silently received the raw base symbol and left the terminal to reject it, so the first anyone learned of a mismatch was a failed copy. `copier_links` now carries `symbol_match_status` (`PENDING` / `MATCHED` / `PARTIAL` / `UNMATCHED`), a per-symbol `symbol_match_report`, and `symbol_match_checked_at`. A mismatch now surfaces immediately: a toast when the link is created, and a persistent warning on the link card naming exactly which symbols didn't resolve. Editing a link's manual prefix/suffix override re-checks it against the new affixes, and either side not having reported symbols yet stays `PENDING` rather than being flagged as a false mismatch.

## [2.0.1] - 2026-08-18

### Fixed

- **Backend deploys were silently stuck since 1.5.0** — that release deleted every Docker artifact on the theory that Berth didn't need them; in fact Berth prefers a `Dockerfile` when one exists and only falls back to Nixpacks otherwise, so both services lost their intended build path. A follow-up fix restored `apps/App/Dockerfile` for the frontend but missed `apps/server/Dockerfile`, so the backend has been building on Nixpacks' guess ever since — or failing outright, in which case Berth's build-before-cutover rollout kept the previous image running with no visible error. It never crashed, it just never went out. `apps/server/Dockerfile` is back, matching the frontend's pattern (`npm ci` against the root lockfile rather than `npm install`, for a reproducible build).

## [2.0.0] - 2026-08-16

### Changed

- **TradePilot 2.0 release** — the root workspace, frontend, server and shared packages now report version 2.0.0, including all internal `@tradepilot/*` dependency pins and the generated app update manifest.

## [1.5.0] - 2026-08-16

### Added

- **Every public page now carries its own metadata** — the app is client-rendered, so until now a crawler that does not execute JavaScript saw the home page's title, description and Open Graph tags on `/pricing`, `/terms` and everywhere else. Facebook, LinkedIn, Slack and Discord all fall in that category, which meant every shared link previewed identically. The build now writes a real HTML file per public route with that route's title, canonical, OG/Twitter tags and JSON-LD baked into the initial response. Route metadata lives once in `src/seo/routes.ts` and drives the prerender, the sitemap and the runtime head manager together, so the three cannot drift apart.
- **A trade copier guide at `/trade-copier`** — a page explaining what a trade copier is, how master-to-slave copying works, what each lot sizing mode does, how symbols are remapped across brokers, and six FAQs covering MT4-to-MT5 copying, prop firm accounts and VPS requirements. It carries `FAQPage` structured data drawn from the same source as the visible answers, so the markup cannot describe content the page does not show. Linked from the header, footer and landing hero.
- **Losing streak probability table on Analytics** — given a win rate and a number of trades, it reports the chance of hitting a run of consecutive losses of a given length. Modelled as a Markov chain over the current run length rather than the naive independent-blocks estimate, so the figure accounts for a streak starting anywhere in the sequence.
- **Alpha Capital Group partner offer** — sits alongside the IC Markets offer with the referral link and a click-to-copy `KFOCU` code chip.
- **Pricing on the landing page** — the plans now appear on `/` rather than only behind a click to `/pricing`, with a "most popular" badge on Pro and per-plan CTAs.

### Changed

- **The two partner offers share one banner** — they were stacked as separate full-width blocks, which read as two consecutive adverts and repeated the sponsored disclaimer twice at mismatched heights. They now sit side by side, split by a slanted divider, under a single disclaimer covering both. Both render through one panel component driven by per-partner configuration, so a third partner is data rather than markup.
- **The sign-in page was rebuilt around the form** — the old layout gave half the screen to a marketing column and buried the actual sign-in card to its right. The headline and card are now centred with the OAuth buttons, email field and legal line in one column, and the right half shows a live-looking copier panel instead of a feature list. It also renders correctly in dark mode for the first time: the previous page hardcoded light-blue gradients, so every colour now resolves through the existing design tokens.
- **Pricing plans have one definition** — the landing page and `/pricing` render the same card component from a shared plan list rather than maintaining separate copies that could disagree on price.
- **The Open Trades page dropped its marketing header** — an internal execution screen was opening with a badge, a 4xl headline, a paragraph and three stat tiles, one of which reported the constant "M / L / S". Those are gone, and the bespoke card shells, input classes and hand-rolled buttons were replaced with the shared `Card`, `Input`, `Select`, `Button`, `Badge` and `Alert` components used everywhere else. Behaviour is unchanged; the stylesheet shrank by 2 kB.
- **The landing page leads with what the product is** — the H1 now names the MT4 and MT5 trade copier rather than describing it obliquely, and the header and footer link the new guide.
- **`sitemap.xml` is generated from the route list** at build time with `lastmod`, replacing the hand-maintained file that had to be edited by hand whenever a page was added.
- **Playwright moved to the right place** — it had been installed into `dependencies` in both the workspace root and the app. It is a test-only tool, so it now sits once in the app's `devDependencies`.

### Fixed

- **The Free and Pro+ buttons were invisible in light mode** — both non-featured pricing CTAs rendered white text on a white surface, leaving an unreadable button on two of the three plans.

### Removed

- **The Docker build and run artifacts** — both `Dockerfile`s, `apps/App/nginx.conf`, `docker-compose.yml`, `docker-compose.prod.yml` and `.dockerignore` are deleted; deployment runs through Berth. Two consequences worth knowing: Berth's agent prefers a `Dockerfile` when one exists under its default `Auto` builder, so builds now fall through to Nixpacks, which needs a start command for the frontend since `apps/App` has no `start` script. And the frontend build reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at build time — the deleted `Dockerfile` supplied them as `ENV`, and without them the bundle throws on boot and renders a blank page. They must now be present in the build environment.
- **`IcPartnerCard`** — folded into the combined partner banner along with its link, regulatory note and disclaimer.

## [1.4.2] - 2026-08-15

### Removed

- **The TradingView Pine scripts** — `FVG-Reversal-Strategy.pine` and `Fair-value-gap-detector.pine` are deleted, emptying `apps/TradingView/`. Both derive from LuxAlgo's "FVG Sessions" indicator, published under CC BY-NC-SA 4.0, whose non-commercial term sits badly with vendoring the source into this repository. Neither file was part of any build. They remain in history at `bfb759b` if the strategy logic is needed again.

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
