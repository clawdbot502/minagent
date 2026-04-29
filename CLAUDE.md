---
description: MinAgent — Bun, React 19 + Ink 7 CLI conventions
globs: "*.ts, *.tsx, *.js, *.jsx, package.json"
alwaysApply: true
---

Use Bun, never Node.js.

- `bun <file>` not `node <file>`
- `bun test` not `jest`/`vitest`
- `bun install` not `npm`/`yarn`/`pnpm`
- `bun run <script>` not `npm run`
- `bunx` not `npx`
- Bun auto-loads .env, no dotenv
- Prefer `Bun.file` over `node:fs`

## Runtime

- Terminal CLI, not web. No `Bun.serve()`, `express`, web frameworks.
- No `bun:sqlite`, `Bun.redis`, `Bun.sql`.
- No WebSocket.
- Use `Bun.$` not `execa`.

## UI

- React 19 + Ink 7 for terminal UI.
- Functional components only.
- No web CSS or HTML.

## Structure

- Tools: `src/tools/` with Zod schemas.
- Commands: `src/commands/` slash-pattern.
- State: `src/state/` serializable.
- Utils: `src/utils/` pure functions.
