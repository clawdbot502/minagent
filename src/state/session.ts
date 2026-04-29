import { appendFileSync, readFileSync, existsSync, mkdirSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Message } from '../types.js';

export interface SessionRecord {
  timestamp: string;
  role: string;
  content: string;
  toolCalls?: string;
  toolCallId?: string;
}

export interface SessionState {
  timestamp?: string;
  cwd?: string;
  messages: Message[];
  metadata?: Record<string, unknown>;
}

export interface LoadSessionOptions {
  cwd?: string;
  allowCrossCwd?: boolean;
}

export function shouldLoadSessionState(
  state: { cwd?: string },
  cwd: string,
  allowCrossCwd = false
): boolean {
  return allowCrossCwd || !state.cwd || state.cwd === cwd;
}

export function getSessionDir(): string {
  const baseDir = join(homedir(), '.minagent');
  if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(baseDir, 0o700);
  } catch {
    // Best effort on non-POSIX platforms
  }

  const dir = join(baseDir, 'sessions');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    // Best effort on non-POSIX platforms
  }
  return dir;
}

export function getTranscriptPath(): string {
  const now = new Date().toISOString().slice(0, 10);
  return join(getSessionDir(), `session-${now}.jsonl`);
}

export function recordMessage(message: Message): void {
  const record: SessionRecord = {
    timestamp: new Date().toISOString(),
    role: message.role,
    content: message.content,
    toolCalls: message.toolCalls ? JSON.stringify(message.toolCalls) : undefined,
    toolCallId: message.toolCallId,
  };

  const line = JSON.stringify(record) + '\n';
  const transcriptPath = getTranscriptPath();
  appendFileSync(transcriptPath, line, { encoding: 'utf-8', mode: 0o600 });
  try {
    chmodSync(transcriptPath, 0o600);
  } catch {
    // Best effort on non-POSIX platforms
  }
}

export function loadTranscript(path?: string): Message[] | null {
  const filePath = path || getTranscriptPath();
  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    const messages: Message[] = [];

    for (const line of lines) {
      try {
        const record = JSON.parse(line) as SessionRecord;
        const msg: Message = {
          role: record.role as Message['role'],
          content: record.content,
        };
        if (record.toolCalls) {
          msg.toolCalls = JSON.parse(record.toolCalls);
        }
        if (record.toolCallId) {
          msg.toolCallId = record.toolCallId;
        }
        messages.push(msg);
      } catch {
        // Skip malformed lines
      }
    }

    return messages;
  } catch {
    return null;
  }
}

export function saveSessionState(messages: Message[], metadata?: Record<string, unknown>): void {
  const sessionDir = getSessionDir();
  const statePath = join(sessionDir, 'last-state.json');
  const state = {
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
    messages,
    metadata,
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2), { encoding: 'utf-8', mode: 0o600 });
  try {
    chmodSync(statePath, 0o600);
  } catch {
    // Best effort on non-POSIX platforms
  }
}

export function loadSessionState(options: LoadSessionOptions = {}): SessionState | null {
  const statePath = join(getSessionDir(), 'last-state.json');
  if (!existsSync(statePath)) return null;

  try {
    const state = JSON.parse(readFileSync(statePath, 'utf-8'));
    const expectedCwd = options.cwd || process.cwd();
    if (!shouldLoadSessionState(state, expectedCwd, options.allowCrossCwd)) {
      return null;
    }

    return {
      timestamp: state.timestamp,
      cwd: state.cwd,
      messages: state.messages || [],
      metadata: state.metadata,
    };
  } catch {
    return null;
  }
}
