import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { UsageRecord, CuratorState, CuratorConfig } from './types.js';
import { getUsagePath, getCuratorStatePath, getSkillsRoot, getArchiveDir } from './utils.js';

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  writeFileSync(path, readFileSync(tmp, 'utf-8'), 'utf-8');
  try {
    require('fs').unlinkSync(tmp);
  } catch {
    // ignore
  }
}

export function ensureUsage(): Record<string, UsageRecord> {
  return readJson(getUsagePath(), {});
}

export function saveUsage(data: Record<string, UsageRecord>): void {
  writeJson(getUsagePath(), data);
}

export function getUsage(name: string): UsageRecord {
  const all = ensureUsage();
  const now = new Date().toISOString();
  return (
    all[name] || {
      useCount: 0,
      viewCount: 0,
      patchCount: 0,
      lastUsedAt: null,
      lastViewedAt: null,
      lastPatchedAt: null,
      createdAt: now,
      state: 'active',
      pinned: false,
      archivedAt: null,
    }
  );
}

export function bumpView(name: string): void {
  const all = ensureUsage();
  const rec = getUsage(name);
  rec.viewCount++;
  rec.lastViewedAt = new Date().toISOString();
  all[name] = rec;
  saveUsage(all);
}

export function bumpUse(name: string): void {
  const all = ensureUsage();
  const rec = getUsage(name);
  rec.useCount++;
  rec.lastUsedAt = new Date().toISOString();
  // If stale and used again, restore to active
  if (rec.state === 'stale') {
    rec.state = 'active';
  }
  all[name] = rec;
  saveUsage(all);
}

export function bumpPatch(name: string): void {
  const all = ensureUsage();
  const rec = getUsage(name);
  rec.patchCount++;
  rec.lastPatchedAt = new Date().toISOString();
  all[name] = rec;
  saveUsage(all);
}

export function isPinned(name: string): boolean {
  return getUsage(name).pinned;
}

export function setPinned(name: string, pinned: boolean): void {
  const all = ensureUsage();
  const rec = getUsage(name);
  rec.pinned = pinned;
  all[name] = rec;
  saveUsage(all);
}

export function archiveSkill(name: string): boolean {
  const all = ensureUsage();
  const rec = getUsage(name);
  if (rec.pinned) return false;
  rec.state = 'archived';
  rec.archivedAt = new Date().toISOString();
  all[name] = rec;
  saveUsage(all);
  return true;
}

export function restoreSkill(name: string): boolean {
  const all = ensureUsage();
  const rec = getUsage(name);
  if (rec.state !== 'archived') return false;
  rec.state = 'active';
  rec.archivedAt = null;
  all[name] = rec;
  saveUsage(all);
  return true;
}

export function deleteUsage(name: string): void {
  const all = ensureUsage();
  delete all[name];
  saveUsage(all);
}

export function listAgentCreatedSkills(): string[] {
  const all = ensureUsage();
  return Object.keys(all).filter((n) => {
    const rec = all[n];
    if (!rec) return false;
    return rec.state !== 'archived';
  });
}

// Curator state
export function getCuratorState(): CuratorState {
  return readJson(getCuratorStatePath(), {
    lastRunAt: null,
    lastRunDurationSeconds: null,
    lastRunSummary: null,
    paused: false,
    runCount: 0,
  });
}

export function saveCuratorState(state: CuratorState): void {
  writeJson(getCuratorStatePath(), state);
}

export function getCuratorConfig(): CuratorConfig {
  return {
    enabled: true,
    intervalHours: 168, // 7 days
    minIdleHours: 2,
    staleAfterDays: 30,
    archiveAfterDays: 90,
  };
}
