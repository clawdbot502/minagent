import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, basename } from 'path';
import type { SkillIndexEntry, SkillMetadata } from './types.js';
import {
  getSkillsRoot,
  getArchiveDir,
  readSkillMd,
  parseFrontmatter,
  buildSkillMetadata,
  skillMatchesPlatform,
} from './utils.js';

export function getSkillIndex(): SkillIndexEntry[] {
  const root = getSkillsRoot();
  if (!existsSync(root)) return [];

  const entries: SkillIndexEntry[] = [];
  const rootEntries = readdirSync(root, { withFileTypes: true });

  for (const entry of rootEntries) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isDirectory()) continue;

    const subPath = join(root, entry.name);
    const subEntries = readdirSync(subPath, { withFileTypes: true });

    // Check for flat skill (direct SKILL.md)
    const flatSkillMd = join(subPath, 'SKILL.md');
    if (existsSync(flatSkillMd)) {
      const meta = loadSkillMetadata(subPath);
      if (meta && skillMatchesPlatform(meta)) {
        entries.push({
          name: meta.name || entry.name,
          description: meta.description,
        });
      }
      continue;
    }

    // Check for category/sub-skill structure
    for (const sub of subEntries) {
      if (!sub.isDirectory()) continue;
      const skillDir = join(subPath, sub.name);
      const skillMd = join(skillDir, 'SKILL.md');
      if (existsSync(skillMd)) {
        const meta = loadSkillMetadata(skillDir);
        if (meta && skillMatchesPlatform(meta)) {
          entries.push({
            name: meta.name || sub.name,
            description: meta.description,
            category: entry.name,
          });
        }
      }
    }
  }

  return entries;
}

export function loadSkillMetadata(skillDir: string): SkillMetadata | null {
  const content = readSkillMd(skillDir);
  if (!content) return null;
  const { metadata } = parseFrontmatter(content);
  return buildSkillMetadata(metadata);
}

export function discoverLinkedFiles(skillDir: string): string[] {
  const linked: string[] = [];
  const dirs = ['references', 'templates', 'scripts', 'assets'];
  for (const dir of dirs) {
    const dirPath = join(skillDir, dir);
    if (!existsSync(dirPath)) continue;
    try {
      const files = readdirSync(dirPath, { recursive: true }) as string[];
      for (const f of files) {
        const full = join(dirPath, f);
        try {
          const s = statSync(full);
          if (s.isFile()) {
            linked.push(`${dir}/${f}`);
          }
        } catch {
          // skip
        }
      }
    } catch {
      // skip
    }
  }
  return linked;
}

export function findSkillDir(name: string): string | null {
  const root = getSkillsRoot();
  if (!existsSync(root)) return null;

  // Try flat first
  const flat = join(root, name);
  if (existsSync(join(flat, 'SKILL.md'))) return flat;

  // Try categorized
  const rootEntries = readdirSync(root, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isDirectory()) continue;
    const candidate = join(root, entry.name, name);
    if (existsSync(join(candidate, 'SKILL.md'))) return candidate;
  }

  // Try archive
  const archive = join(getArchiveDir(), name);
  if (existsSync(join(archive, 'SKILL.md'))) return archive;

  return null;
}
