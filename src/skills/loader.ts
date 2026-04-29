import { readdirSync, existsSync } from 'fs';
import { join, extname } from 'path';
import type { Skill, SkillModule } from './types.js';
import type { SkillRegistry } from './registry.js';

const SUPPORTED_EXTS = ['.ts', '.js', '.mjs'];

export interface SkillLoadIssue {
  file: string;
  message: string;
}

export interface SkillDuplicate {
  name: string;
  file: string;
}

export interface SkillLoadResult {
  loaded: number;
  errors: SkillLoadIssue[];
  duplicates: SkillDuplicate[];
}

export async function loadSkillsFromDir(dir: string, registry: SkillRegistry): Promise<SkillLoadResult> {
  const result: SkillLoadResult = { loaded: 0, errors: [], duplicates: [] };
  if (!existsSync(dir)) return result;

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = extname(entry.name);
    if (!SUPPORTED_EXTS.includes(ext)) continue;

    const fullPath = join(dir, entry.name);
    try {
      const mod = await import(fullPath) as SkillModule;
      if (mod.default && typeof mod.default === 'object') {
        const skill = mod.default as Skill;
        if (skill.name && skill.description && skill.prompt) {
          const previous = registry.register(skill);
          if (previous) {
            result.duplicates.push({ name: skill.name, file: fullPath });
          }
          result.loaded++;
        } else {
          result.errors.push({ file: fullPath, message: 'Missing required name, description, or prompt.' });
        }
      } else {
        result.errors.push({ file: fullPath, message: 'Default export must be a skill object.' });
      }
    } catch (err) {
      result.errors.push({
        file: fullPath,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
