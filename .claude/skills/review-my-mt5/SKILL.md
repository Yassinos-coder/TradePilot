---
name: review-my-mt5
description: Review, compile-check, and debug this project's MT5/MQL5 Expert Advisors (apps/Metatrader-eas/MT5/*.mq5), and pull live account and trade analytics (balance, equity, margin, leverage, open positions, order/trade history) straight from a running MT5 terminal — using the local "metaeditor" and "terminal" MCP servers. Make sure to use this skill whenever the conversation touches MT5, MetaTrader, MQL5, an Expert Advisor / EA, compiling or syntax-checking a .mq5 file, or reviewing/analyzing live trades, account state, or trading performance for this project — even if the user doesn't name the skill or say "MCP", e.g. "does this EA even compile", "check my risk guard for errors", "how's my account doing right now", "pull my trade history", "why isn't the EA closing losing positions", "is the daily loss guard actually tripping".
---

# Review My MT5

This project (TradePilot) has two local HTTP MCP servers registered in `.mcp.json`, both bridging into software that must actually be running on the user's machine:

- **`metaeditor`** (`http://127.0.0.1:22345/mcp`) — a bridge into MetaEditor. Use it to compile / syntax-check `.mq5` (and `.mqh`) files and get back real compiler errors and warnings, instead of eyeballing MQL5 for mistakes.
- **`terminal`** (`http://127.0.0.1:22346/mcp`) — a bridge into a running MT5 terminal. Use it to read live account state, open positions, and order/trade history directly from the terminal, instead of guessing from static code or asking the user to copy-paste numbers.

Both are namespaced MCP tool sets, not a single fixed API — **discover what's actually exposed before calling anything**. Tool names on these servers were not hardcoded when this skill was written, so:

1. List the tools available under the `metaeditor` and `terminal` MCP servers before using them (e.g. via the MCP tool/resource listing mechanism available in this session).
2. Match the user's intent to whichever tool actually exists (compile / check / build for MetaEditor; account info / positions / history / logs for the terminal) rather than assuming a specific name.
3. If a server exposes nothing useful for the task at hand, say so plainly rather than forcing an unrelated tool call.

## When to reach for `metaeditor`

Anytime you write, edit, or are asked to review MQL5 code under `apps/Metatrader-eas/` (this repo currently has `TradePilot_EA.mq5`, `TradePilot_ATR_Excursion_EA.mq5`, `TradePilot_EMA_Census.mq5`, `TradePilot_AMD_Census.mq5`, `TradePilot_Gold_Pattern_Census.mq5`, `TradePilot_RiskGuard_EA.mq5`, and the MT4 `TradePilot_EA.mq4`):

- Compile or syntax-check the file(s) you touched through the `metaeditor` tools before telling the user a change is done. MQL5 can't be run through a JS/TS toolchain the way the rest of this monorepo can — this is the only way to actually catch a typo, a bad signature, or a missing include before the user finds out live in a terminal.
- Report every error and warning verbatim, with file and line number, exactly as the compiler gives it. Don't paraphrase or drop warnings just because the build "mostly" succeeded.
- If more than one `.mq5` file is in play and it's not obvious which one the user means, ask rather than guessing — these files control real trading behavior and money.

## When to reach for `terminal`

Anytime the user wants to know what's actually happening on their MT5 account right now, or wants trade analytics:

- Pull live account info (balance, equity, margin, free margin, margin level, leverage) and summarize it plainly.
- Pull open positions and recent order/trade history when the user asks about performance, a specific trade, or "what's open right now."
- Use this to sanity-check the `TradePilot_RiskGuard_EA` (or any EA's) actual behavior against what the code says it should do — e.g. if the user asks "did the daily loss guard actually trip", check the live account's day P/L and open positions against the EA's logic rather than just re-reading the source.
- If the user asks for analysis (win rate, average R, drawdown, which symbols are bleeding, etc.), pull the raw trade/order history first and compute it yourself rather than asking the user to export anything.

## If a server doesn't respond

These are local bridges — they only work while MetaEditor and/or the MT5 terminal are actually open on the user's machine. If a call to `metaeditor` or `terminal` fails, times out, or the connection is refused:

- Say so directly: name which bridge failed (`metaeditor` on port 22345, or `terminal` on port 22346) and tell the user to check that the corresponding application is running.
- Don't silently fall back to guessing at compiler behavior or live account numbers — offer to do a static code read-through instead if that's still useful, but be explicit that it's a substitute, not the real check.
