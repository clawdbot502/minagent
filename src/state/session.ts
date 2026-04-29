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

function isValidRecord(value: unknown): value is SessionRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.timestamp === 'string' &&
    typeof r.role === 'string' &&
    typeof r.content === 'string' &&
    (r.toolCalls === undefined || typeof r.toolCalls === 'string') &&
    (r.toolCallId === undefined || typeof r.toolCallId === 'string')
  );
}

function isValidMessageRole(role: string): role is Message['role'] {
  return ['user', 'assistant', 'system', 'tool'].includes(role);
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
        const parsed = JSON.parse(line);
        if (!isValidRecord(parsed)) continue;
        if (!isValidMessageRole(parsed.role)) continue;

        const msg: Message = {
          role: parsed.role,
          content: parsed.content,
        };
        if (parsed.toolCalls) {
          msg.toolCalls = JSON.parse(parsed.toolCalls);
        }
        if (parsed.toolCallId) {
          msg.toolCallId = parsed.toolCallId;
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
    const raw = JSON.parse(readFileSync(statePath, 'utf-8'));
    if (typeof raw !== 'object' || raw === null) return null;

    const state = raw as Record<string, unknown>;
    const expectedCwd = options.cwd || process.cwd();
    if (!shouldLoadSessionState(state as { cwd?: string }, expectedCwd, options.allowCrossCwd)) {
      return null;
    }

    if (!Array.isArray(state.messages)) return null;

    const messages: Message[] = [];
    for (const msg of state.messages) {
      if (
        typeof msg === 'object' &&
        msg !== null &&
        'role' in msg &&
        typeof (msg as Message).role === 'string' &&
        'content' in msg &&
        typeof (msg as Message).content === 'string'
      ) {
        messages.push(msg as Message);
      }
    }

    return {
      timestamp: typeof state.timestamp === 'string' ? state.timestamp : undefined,
      cwd: typeof state.cwd === 'string' ? state.cwd : undefined,
      messages,
      metadata: typeof state.metadata === 'object' && state.metadata !== null ? (state.metadata as Record<string, unknown>) : undefined,
    };
  } catch {
    return null;
  }
}
