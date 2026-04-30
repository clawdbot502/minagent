import { existsSync, readFileSync } from 'fs';
import { join, normalize, relative, sep } from 'path';
import type { SkillMetadata } from './types.js';
import {
  VALID_SKILL_NAME_RE,
  MAX_SKILL_NAME_LEN,
  MAX_DESCRIPTION_LEN,
  ALLOWED_SUPPORTING_DIRS,
} from './types.js';

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;

export function parseFrontmatter(content: string): {
  metadata: Record<string, unknown>;
  body: string;
} {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { metadata: {}, body: content };
  }
  const metadata: Record<string, unknown> = {};
  const yamlBlock = match[1]!;
  for (const line of yamlBlock.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let raw = line.slice(idx + 1).trim();
    // Strip optional quotes
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      raw = raw.slice(1, -1);
    }
    // Simple array parsing: [a, b, c]
    if (raw.startsWith('[') && raw.endsWith(']')) {
      metadata[key] = raw
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      metadata[key] = raw;
    }
  }
  return { metadata, body: match[2]! };
}

export function buildSkillMetadata(
  parsed: Record<string, unknown>
): SkillMetadata {
  return {
    name: String(parsed.name || ''),
    description: String(parsed.description || ''),
    version: parsed.version ? String(parsed.version) : undefined,
    platforms: Array.isArray(parsed.platforms)
      ? parsed.platforms.map(String)
      : undefined,
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.map(String)
      : undefined,
    category: parsed.category ? String(parsed.category) : undefined,
  };
}

export function validateSkillName(name: string): string | null {
  if (!name) return 'name is required';
  if (name.length > MAX_SKILL_NAME_LEN) return `name must be <= ${MAX_SKILL_NAME_LEN} chars`;
  if (!VALID_SKILL_NAME_RE.test(name)) {
    return 'name must be lowercase alphanumeric with - _ . (max 64 chars)';
  }
  return null;
}

export function validateSkillMetadata(meta: SkillMetadata): string | null {
  const nameErr = validateSkillName(meta.name);
  if (nameErr) return nameErr;
  if (!meta.description) return 'description is required';
  if (meta.description.length > MAX_DESCRIPTION_LEN) {
    return `description must be <= ${MAX_DESCRIPTION_LEN} chars`;
  }
  return null;
}

export function hasTraversalComponent(filePath: string): boolean {
  const normalized = normalize(filePath);
  return normalized.startsWith('..') || normalized.startsWith(sep) || normalized.includes(`..${sep}`);
}

export function isAllowedSupportingPath(filePath: string): boolean {
  const normalized = normalize(filePath);
  const parts = normalized.split(sep).filter(Boolean);
  if (parts.length === 0) return false;
  return ALLOWED_SUPPORTING_DIRS.has(parts[0]!);
}

export function validateWithinDir(targetPath: string, baseDir: string): boolean {
  const resolved = normalize(targetPath);
  const base = normalize(baseDir);
  const rel = relative(base, resolved);
  return !rel.startsWith('..') && !rel.startsWith(sep);
}

export function getSkillsRoot(): string {
  return join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.minagent', 'skills');
}

export function getSkillDir(name: string, category?: string): string {
  const root = getSkillsRoot();
  if (category) {
    return join(root, category, name);
  }
  return join(root, name);
}

export function getArchiveDir(): string {
  return join(getSkillsRoot(), '.archive');
}

export function getUsagePath(): string {
  return join(getSkillsRoot(), '.usage.json');
}

export function getCuratorStatePath(): string {
  return join(getSkillsRoot(), '.curator_state.json');
}

export function getSnapshotPath(): string {
  return join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.minagent', '.skills_prompt_snapshot.json');
}

export function discoverSkillNames(): Array<{ name: string; category?: string }> {
  const root = getSkillsRoot();
  if (!existsSync(root)) return [];

  const result: Array<{ name: string; category?: string }> = [];
  const entries = require('fs').readdirSync(root, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isDirectory()) continue;

    const subPath = join(root, entry.name);
    const subEntries = require('fs').readdirSync(subPath, { withFileTypes: true });

    let hasSkills = false;
    for (const sub of subEntries) {
      if (sub.isDirectory()) {
        const skillMd = join(subPath, sub.name, 'SKILL.md');
        if (existsSync(skillMd)) {
          result.push({ name: sub.name, category: entry.name });
        }
      }
    }

    // Also check flat structure
    const skillMd = join(subPath, 'SKILL.md');
    if (existsSync(skillMd)) {
      result.push({ name: entry.name });
      hasSkills = true;
    }
  }

  return result;
}

export function readSkillMd(skillDir: string): string | null {
  const path = join(skillDir, 'SKILL.md');
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

export function skillMatchesPlatform(frontmatter: SkillMetadata): boolean {
  if (!frontmatter.platforms || frontmatter.platforms.length === 0) return true;
  const platformMap: Record<string, string[]> = {
    darwin: ['macos', 'darwin'],
    linux: ['linux'],
    win32: ['windows', 'win32'],
    freebsd: ['freebsd'],
  };
  const current = process.platform;
  const aliases = platformMap[current] || [current];
  return frontmatter.platforms.some((p) => aliases.includes(p.toLowerCase()));
}

// Simple prompt-injection pattern scan
const INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /ignore\s+above\s+instructions/i,
  /system\s*:\s*you\s+are\s+now/i,
  /new\s+role\s*:\s*/i,
  /override\s+system\s+prompt/i,
  /disregard\s+all\s+prior/i,
];

export function scanForInjection(content: string): string | null {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      return `Blocked pattern: ${pattern.source}`;
    }
  }
  return null;
}
