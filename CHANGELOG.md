# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
