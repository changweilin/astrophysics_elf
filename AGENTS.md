# Project AI Operating Map

**Read [`CLAUDE.md`](CLAUDE.md) now — it is the single source of truth for every
agent (Codex/ChatGPT included), not a Claude-only file.**

It holds the architecture map, the durable guardrails (isolation by contract,
additive first, measure before tuning, zero-dependency bias, ASCII code /
zh-TW copy, muted visuals, preserved globals), the run + verification
commands, and the skill/subagent table.

This file used to duplicate all of that and drift out of sync. It is now a
pointer on purpose: edit `CLAUDE.md`, never this file.

Codex-side role definitions live in `.codex/skills/` and `.codex/agents/`
(mirrors of `.claude/skills/` and `.claude/agents/`).
