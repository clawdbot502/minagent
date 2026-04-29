import type { Message } from '../types.js';
import type { Config } from '../config.js';

export interface CompactOptions {
  targetMessages: number;
  preserveRecent: number;
}

// Buffer to leave room for response generation
const COMPACT_BUFFER = 13_000;
const WARNING_BUFFER = 20_000;

/**
 * Get context window size from config. No hardcoded model names —
 * the user controls this via MINA_CONTEXT_WINDOW env var.
 */
export function getContextWindow(config: Config): number {
  return config.contextWindow || 128_000;
}

export function getCompactThreshold(config: Config): number {
  return getContextWindow(config) - COMPACT_BUFFER;
}

export function getWarningThreshold(config: Config): number {
  return getContextWindow(config) - WARNING_BUFFER;
}

export function compactMessages(
  messages: Message[],
  options: CompactOptions = { targetMessages: 10, preserveRecent: 4 }
): Message[] {
  if (messages.length <= options.targetMessages) {
    return messages;
  }

  const preserved = messages.slice(-options.preserveRecent);
  const toSummarize = messages.slice(0, -options.preserveRecent);

  // Build a summary of old messages
  const userMessages = toSummarize
    .filter((m) => m.role === 'user')
    .map((m) => m.content.slice(0, 200));

  const toolUsages = toSummarize
    .filter((m) => m.role === 'assistant' && m.toolCalls)
    .flatMap((m) => m.toolCalls || [])
    .map((tc) => `${tc.name}(${JSON.stringify(tc.arguments).slice(0, 80)})`);

  const summaryLines: string[] = ['[Earlier conversation summarized]'];

  if (userMessages.length > 0) {
    summaryLines.push('User requests:');
    for (const msg of userMessages) {
      summaryLines.push(`  - ${msg}`);
    }
  }

  if (toolUsages.length > 0) {
    summaryLines.push('Tools used:');
    for (const usage of toolUsages.slice(0, 10)) {
      summaryLines.push(`  - ${usage}`);
    }
    if (toolUsages.length > 10) {
      summaryLines.push(`  ... and ${toolUsages.length - 10} more`);
    }
  }

  const summary: Message = {
    role: 'user',
    content: summaryLines.join('\n'),
  };

  return [summary, ...preserved];
}

function estimateTokenCount(text: string): number {
  let tokens = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    // CJK ranges: basic CJK, extension A, Hangul, Hiragana, Katakana
    const isCJK =
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x3040 && code <= 0x309f) ||
      (code >= 0x30a0 && code <= 0x30ff);
    tokens += isCJK ? 1.5 : 0.25;
  }
  return Math.ceil(tokens);
}

export function estimateTokens(messages: Message[]): number {
  let tokens = 0;
  for (const msg of messages) {
    tokens += estimateTokenCount(msg.content);
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        tokens += estimateTokenCount(tc.name + JSON.stringify(tc.arguments));
      }
    }
  }
  return tokens;
}

export function shouldCompact(messages: Message[], config: Config): boolean {
  return estimateTokens(messages) > getCompactThreshold(config);
}

export function shouldWarnCompact(messages: Message[], config: Config): boolean {
  return estimateTokens(messages) > getWarningThreshold(config);
}
