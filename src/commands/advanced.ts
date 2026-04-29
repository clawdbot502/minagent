import type { Command } from './types.js';
import { compactMessages, estimateTokens } from '../utils/compaction.js';
import { loadSessionState } from '../state/session.js';

export const compactCommand: Command = {
  name: 'compact',
  description: 'Compress conversation history to save tokens',
  execute: async (_args, ctx) => {
    const messages = ctx.agent.getMessages();
    const beforeTokens = estimateTokens(messages);
    const compacted = compactMessages(messages);
    ctx.agent.setMessages(compacted);
    const afterTokens = estimateTokens(compacted);
    return `Compacted: ${messages.length} → ${compacted.length} messages (${beforeTokens} → ${afterTokens} tokens)`;
  },
};

export const planCommand: Command = {
  name: 'plan',
  description: 'Enter plan mode (ask before executing tools)',
  execute: async (_args, ctx) => {
    ctx.agent.setPermissionMode('plan');
    return 'Entered plan mode. All tool calls will require confirmation.';
  },
};

export const actCommand: Command = {
  name: 'act',
  description: 'Exit plan mode and enter act mode',
  execute: async (_args, ctx) => {
    ctx.agent.setPermissionMode('default');
    return 'Entered act mode (default). Destructive tools will be confirmed.';
  },
};

export const resumeCommand: Command = {
  name: 'resume',
  description: 'Resume the previous session',
  execute: async (_args, ctx) => {
    const state = loadSessionState();
    if (!state || !state.messages.length) {
      return 'No previous session found.';
    }
    ctx.agent.setMessages(state.messages);
    return `Resumed session with ${state.messages.length} messages.`;
  },
};

export const tokensCommand: Command = {
  name: 'tokens',
  description: 'Show estimated token usage for this session',
  execute: async (_args, ctx) => {
    const messages = ctx.agent.getMessages();
    const tokens = estimateTokens(messages);
    const costSummary = ctx.agent.getCostSummary();
    return `${costSummary}\nEstimated tokens: ${tokens}`;
  },
};

export const addCommand: Command = {
  name: 'add',
  description: 'Add a file to the conversation context',
  execute: async (args, ctx) => {
    const filePath = args.trim();
    if (!filePath) return 'Usage: /add <filepath>';
    return ctx.agent.addContextFile(filePath);
  },
};

export const dropCommand: Command = {
  name: 'drop',
  description: 'Remove a file from the conversation context',
  execute: async (args, ctx) => {
    const filePath = args.trim();
    if (!filePath) return 'Usage: /drop <filepath>';
    return ctx.agent.removeContextFile(filePath);
  },
};

export const contextCommand: Command = {
  name: 'context',
  description: 'Show current context files',
  execute: async (_args, ctx) => {
    return 'Context files:\n' + ctx.agent.listContextFiles();
  },
};
