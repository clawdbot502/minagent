import type { Command } from './types.js';

export const clearCommand: Command = {
  name: 'clear',
  description: 'Clear conversation history',
  execute: async (_args, ctx) => {
    ctx.agent.clear();
    return 'Conversation cleared.';
  },
};

export const skillsCommand: Command = {
  name: 'skills',
  description: 'List available skills',
  execute: async (_args, ctx) => {
    const list = ctx.skills.list();
    if (list.length === 0) return 'No skills loaded.';
    return 'Available skills:\n' + list.map((s) => `  /${s.name} - ${s.description}`).join('\n');
  },
};

export const modelCommand: Command = {
  name: 'model',
  description: 'Show the current LLM model configuration',
  execute: async (_args) => {
    const provider = process.env.MINA_PROVIDER || 'generic';
    const model = process.env.MINA_MODEL || '(not set)';
    const baseUrl = process.env.MINA_BASE_URL || '(default endpoint)';
    const ctxWindow = process.env.MINA_CONTEXT_WINDOW || '128000 (default)';
    return `Provider: ${provider}\nModel: ${model}\nBase URL: ${baseUrl}\nContext window: ${ctxWindow}`;
  },
};

export const permissionsCommand: Command = {
  name: 'permissions',
  description: 'Show current permission mode',
  execute: async (_args, ctx) => {
    const mode = ctx.agent.getPermissionMode();
    return `Current permission mode: ${mode}\n` +
           'Modes: default | plan | acceptEdits | bypassPermissions | dontAsk\n' +
           'Set via MINA_PERMISSION_MODE env var.';
  },
};

export const costCommand: Command = {
  name: 'cost',
  description: 'Show estimated API cost for this session',
  execute: async (_args, ctx) => {
    return ctx.agent.getCostSummary();
  },
};

export const helpCommand: Command = {
  name: 'help',
  description: 'Show available commands',
  execute: async () => {
    return `Available commands:

Git:
  /status, /diff, /diff-staged, /log [n], /commit <msg>
  /branch, /checkout <b>, /stash, /push, /pull
  /reset [mode], /merge <branch>, /rebase <branch>
  /tag [name], /remote, /show [ref]
  /cherry-pick <commit>, /blame <file>, /bisect <cmd>
  /stash-pop, /stash-list

GitHub:
  /pr, /pr-view <n>, /pr-create <title>
  /issue, /issue-view <n>, /repo

Session:
  /clear, /compact, /resume, /tokens, /cost
  /undo, /redo, /history, /sessions

System:
  /plan, /act, /permissions, /theme [name]
  /skills, /model, /doctor, /config [key value]
  /env, /version, /help, /quit

Context:
  /add <file>, /drop <file>, /context

Project:
  /test [pattern]  — auto-detect and run tests
  /format          — auto-format code (prettier, black, cargo fmt, etc.)

Changes:
  /changes         — list files changed this session
  /diff            — show detailed diff of session changes`;
  },
};
