---
description: Guidelines for AI agents working on MinAgent
globs: "*.ts, *.tsx, *.js, *.jsx, *.json, *.md"
alwaysApply: true

# MinAgent — AI Agent Collaboration Guide

MinAgent is a production-grade AI agent CLI built with Bun, React 19, and Ink 7.

## Tech Stack

- **Runtime**: Bun >= 1.0.0. Never use Node.js, npm, pnpm, or yarn.
- **Language**: TypeScript with strict mode.
- **UI**: React 19 + Ink 7 for terminal rendering.
- **Testing**: `bun test` only.
- **Validation**: Zod for all input schemas.

## Code Conventions

- Explicit types for public APIs.
- Functional components for React/Ink UI.
- Tools in `src/tools/`, commands in `src/commands/`, state in `src/state/`.

## Security

- 5 permission modes: `default`, `plan`, `acceptEdits`, `bypassPermissions`, `dontAsk`.
- Destructive tools require confirmation by default.
- WebFetch has SSRF protections — never bypass.
- No hardcoded credentials; use env vars or `~/.minagent/config.json`.
- Local skills (`./skills/`) are opt-in via `MINA_TRUST_LOCAL_SKILLS=true`.

## Requirements

- New tools need unit tests.
- Bug fixes need regression tests.
- Run `bun test` and `bun run typecheck` before submitting.
- Update README.md and AGENTS.md when adding features.
