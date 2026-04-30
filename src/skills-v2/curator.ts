import { existsSync, readdirSync, statSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import type { CuratorState, CuratorConfig, UsageRecord } from './types.js';
import {
  getSkillsRoot,
  getArchiveDir,
  getUsagePath,
  getCuratorStatePath,
  readSkillMd,
  parseFrontmatter,
} from './utils.js';
import {
  getCuratorState,
  saveCuratorState,
  getCuratorConfig,
  ensureUsage,
  saveUsage,
  getUsage,
} from './telemetry.js';

function hoursSince(isoDate: string | null): number {
  if (!isoDate) return Infinity;
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return (now - then) / (1000 * 60 * 60);
}

function daysSince(isoDate: string | null): number {
  return hoursSince(isoDate) / 24;
}

function isSkillDir(dirPath: string): boolean {
  return existsSync(join(dirPath, 'SKILL.md'));
}

function listAllSkillDirs(): Array<{ name: string; dir: string; category?: string }> {
  const root = getSkillsRoot();
  if (!existsSync(root)) return [];

  const result: Array<{ name: string; dir: string; category?: string }> = [];
  const entries = readdirSync(root, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isDirectory()) continue;

    const subPath = join(root, entry.name);

    // Flat skill
    if (isSkillDir(subPath)) {
      result.push({ name: entry.name, dir: subPath });
      continue;
    }

    // Categorized skills
    const subEntries = readdirSync(subPath, { withFileTypes: true });
    for (const sub of subEntries) {
      if (!sub.isDirectory()) continue;
      const skillDir = join(subPath, sub.name);
      if (isSkillDir(skillDir)) {
        result.push({ name: sub.name, dir: skillDir, category: entry.name });
      }
    }
  }

  return result;
}

// Simple heuristic review: check for common quality issues
function reviewSkillQuality(skillDir: string): string[] {
  const issues: string[] = [];
  const content = readSkillMd(skillDir);
  if (!content) {
    issues.push('Missing SKILL.md');
    return issues;
  }

  const { metadata, body } = parseFrontmatter(content);
  if (!metadata.name) issues.push('Missing name in frontmatter');
  if (!metadata.description) issues.push('Missing description in frontmatter');
  if (!body.trim()) issues.push('Empty body content');
  if (body.trim().length < 200) issues.push('Body is very short (< 200 chars)');

  // Check for broken template references
  const templateRefs = body.match(/\$\{[A-Z_]+\}/g) || [];
  for (const ref of templateRefs) {
    if (ref !== '${MINA_SKILL_DIR}' && ref !== '${MINA_SESSION_ID}') {
      issues.push(`Unrecognized template variable: ${ref}`);
    }
  }

  return issues;
}

export interface CuratorRunResult {
  transitioned: number;
  archived: number;
  reviewed: number;
  issuesFound: number;
  durationSeconds: number;
}

export function runCurator(): CuratorRunResult {
  const config = getCuratorConfig();
  const state = getCuratorState();

  if (!config.enabled || state.paused) {
    return {
      transitioned: 0,
      archived: 0,
      reviewed: 0,
      issuesFound: 0,
      durationSeconds: 0,
    };
  }

  // Respect interval
  if (state.lastRunAt && hoursSince(state.lastRunAt) < config.intervalHours) {
    return {
      transitioned: 0,
      archived: 0,
      reviewed: 0,
      issuesFound: 0,
      durationSeconds: 0,
    };
  }

  const start = Date.now();
  const skills = listAllSkillDirs();
  const usage = ensureUsage();
  let transitioned = 0;
  let archived = 0;
  let reviewed = 0;
  let issuesFound = 0;

  // Ensure archive dir exists
  const archiveDir = getArchiveDir();
  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true });
  }

  for (const skill of skills) {
    const rec = getUsage(skill.name);

    // Skip pinned
    if (rec.pinned) continue;

    // Review all skills
    reviewed++;
    const issues = reviewSkillQuality(skill.dir);
    issuesFound += issues.length;

    // State transitions
    if (rec.state === 'active') {
      const idleDays = daysSince(rec.lastUsedAt || rec.createdAt);
      if (idleDays > config.staleAfterDays) {
        rec.state = 'stale';
        usage[skill.name] = rec;
        transitioned++;
      }
    } else if (rec.state === 'stale') {
      const staleDays = daysSince(rec.lastUsedAt || rec.lastViewedAt || rec.createdAt);
      if (staleDays > config.archiveAfterDays) {
        // Move to archive
        const destDir = join(archiveDir, skill.name);
        if (!existsSync(destDir)) {
          try {
            mkdirSync(destDir, { recursive: true });
            // Copy skill files
            const files = readdirSync(skill.dir);
            for (const f of files) {
              const src = join(skill.dir, f);
              const dst = join(destDir, f);
              const s = statSync(src);
              if (s.isDirectory()) {
                // Simple shallow copy for directories
                const subFiles = readdirSync(src);
                for (const sf of subFiles) {
                  const srcFile = join(src, sf);
                  const dstFile = join(dst, sf);
                  require('fs').copyFileSync(srcFile, dstFile);
                }
              } else {
                require('fs').copyFileSync(src, dst);
              }
            }
            // Remove original
            require('fs').rmSync(skill.dir, { recursive: true, force: true });
            rec.state = 'archived';
            rec.archivedAt = new Date().toISOString();
            usage[skill.name] = rec;
            archived++;
          } catch {
            // Skip on error
          }
        }
      }
    }
  }

  saveUsage(usage);

  const durationSeconds = Math.round((Date.now() - start) / 1000);
  const summary = `Reviewed ${reviewed} skills, transitioned ${transitioned} to stale, archived ${archived}, found ${issuesFound} quality issues.`;

  saveCuratorState({
    lastRunAt: new Date().toISOString(),
    lastRunDurationSeconds: durationSeconds,
    lastRunSummary: summary,
    paused: state.paused,
    runCount: state.runCount + 1,
  });

  return { transitioned, archived, reviewed, issuesFound, durationSeconds };
}

export function toggleCuratorPause(paused?: boolean): boolean {
  const state = getCuratorState();
  const newPaused = paused !== undefined ? paused : !state.paused;
  saveCuratorState({ ...state, paused: newPaused });
  return newPaused;
}

export function getCuratorStatus(): string {
  const state = getCuratorState();
  const config = getCuratorConfig();

  const lines = [
    `Curator status: ${state.paused ? 'paused' : 'running'}`,
    `Run count: ${state.runCount}`,
    `Last run: ${state.lastRunAt || 'never'}`,
    config.enabled ? `Interval: ${config.intervalHours}h` : 'Disabled in config',
    `Stale threshold: ${config.staleAfterDays} days`,
    `Archive threshold: ${config.archiveAfterDays} days`,
  ];

  if (state.lastRunSummary) {
    lines.push(`Last summary: ${state.lastRunSummary}`);
  }

  return lines.join('\n');
}
