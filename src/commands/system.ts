import type { Command } from './types.js';
import { skillScopeManager } from '../skills-v2/scope.js';
import { getSkillIndex } from '../skills-v2/discovery.js';

export const clearCommand: Command = {
  name: 'clear',
  description: 'Clear conversation history',
  execute: async (_args, ctx) => {
    ctx.agent.clear();
    skillScopeManager.exitAll('clear');
    return 'Conversation cleared.';
  },
};

export const skillsCommand: Command = {
  name: 'skills',
  description: 'List available skills (v1 and v2)',
  execute: async (_args, ctx) => {
    const v1 = ctx.skills.list();
    const v2 = getSkillIndex();
    const lines: string[] = [];

    if (v1.length > 0) {
      lines.push('Built-in skills (v1):');
      for (const s of v1) {
        lines.push(`  /${s.name} - ${s.description}`);
      }
    }

    if (v2.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('Custom skills (v2):');
      for (const e of v2) {
        const cat = e.category ? ` [${e.category}]` : '';
        lines.push(`  /${e.name}${cat} - ${e.description}`);
      }
    }

    if (lines.length === 0) return 'No skills loaded.';
    return lines.join('\n');
  },
};

export const defaultCommand: Command = {
  name: 'default',
  description: 'Exit all active skills and return to default mode',
  execute: async (_args, ctx) => {
    ctx.agent.setActiveSkill(null);
    skillScopeManager.exitAll('user_command');
    const active = skillScopeManager.getActiveSkillNames();
    if (active.length === 0) {
      return 'Returned to default mode. No active skills.';
    }
    return `Returned to default mode. Exited: ${active.join(', ')}`;
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
  /skills, /default, /model, /doctor, /config [key value]
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
