import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import type { SkillIndexEntry } from './types.js';
import { getSkillIndex } from './discovery.js';
import { getSnapshotPath, getSkillsRoot } from './utils.js';

// In-process LRU cache (max 8 entries)
const promptCache = new Map<string, { prompt: string; mtime: number }>();
const MAX_CACHE_ENTRIES = 8;

function makeCacheKey(): string {
  try {
    const root = getSkillsRoot();
    const stat = existsSync(root) ? require('fs').statSync(root) : null;
    return `${root}:${stat?.mtimeMs || 0}:${stat?.size || 0}`;
  } catch {
    return 'default';
  }
}

function evictOldest(): void {
  if (promptCache.size <= MAX_CACHE_ENTRIES) return;
  const first = promptCache.keys().next().value;
  if (first) promptCache.delete(first);
}

export function buildSkillsSystemPrompt(): string {
  const key = makeCacheKey();
  const cached = promptCache.get(key);
  if (cached) return cached.prompt;

  // Try disk snapshot
  const snapshotPath = getSnapshotPath();
  if (existsSync(snapshotPath)) {
    try {
      const snap = JSON.parse(readFileSync(snapshotPath, 'utf-8'));
      if (snap.key === key && snap.prompt) {
        promptCache.set(key, { prompt: snap.prompt, mtime: Date.now() });
        return snap.prompt;
      }
    } catch {
      // ignore
    }
  }

  const entries = getSkillIndex();
  if (entries.length === 0) {
    return '';
  }

  const lines: string[] = [
    '## Skills',
    '',
    'Before replying, scan the available skills below.',
    'If one clearly matches the user\'s task, follow this protocol:',
    '',
    '1. Load the skill with SkillViewTool(name=<skill_name>). This gives you the full instructions.',
    '2. After loading, the skill enters scope and its instructions appear in the tool result.',
    '3. Follow those instructions in your next response.',
    '4. Use mode=session if the skill should stay active across multiple turns.',
    '5. Use SkillExitTool(name=<skill_name>) when the skill task is complete.',
    '',
    '<available_skills>',
  ];

  // Group by category
  const byCategory = new Map<string, SkillIndexEntry[]>();
  const uncategorized: SkillIndexEntry[] = [];

  for (const e of entries) {
    if (e.category) {
      const list = byCategory.get(e.category) || [];
      list.push(e);
      byCategory.set(e.category, list);
    } else {
      uncategorized.push(e);
    }
  }

  for (const [cat, list] of byCategory) {
    lines.push(`  ${cat}:`);
    for (const e of list) {
      lines.push(`    - ${e.name}: ${e.description}`);
    }
  }

  if (uncategorized.length > 0) {
    lines.push('  general:');
    for (const e of uncategorized) {
      lines.push(`    - ${e.name}: ${e.description}`);
    }
  }

  lines.push('</available_skills>');

  const prompt = lines.join('\n');

  // Cache in memory
  evictOldest();
  promptCache.set(key, { prompt, mtime: Date.now() });

  // Write disk snapshot
  try {
    mkdirSync(require('path').dirname(snapshotPath), { recursive: true });
    writeFileSync(
      snapshotPath,
      JSON.stringify({ key, prompt }, null, 2),
      'utf-8'
    );
  } catch {
    // ignore
  }

  return prompt;
}

export function clearSkillsSystemPromptCache(clearSnapshot = true): void {
  promptCache.clear();
  if (clearSnapshot) {
    try {
      const path = getSnapshotPath();
      if (existsSync(path)) {
        require('fs').unlinkSync(path);
      }
    } catch {
      // ignore
    }
  }
}

export function buildSkillInvocationMessage(
  skillName: string,
  skillContent: string,
  skillDir: string,
  linkedFiles: string[],
  userInstruction: string
): string {
  const parts: string[] = [
    `[IMPORTANT: The user has invoked the "${skillName}" skill, indicating they want you to follow its instructions. The full skill content is loaded below.]`,
    '',
    '<skill_content>',
    skillContent,
    '</skill_content>',
    '',
    `[Skill directory: ${skillDir}]`,
  ];

  if (linkedFiles.length > 0) {
    parts.push('');
    parts.push('[This skill has supporting files:]');
    for (const f of linkedFiles) {
      parts.push(`- ${f}`);
    }
  }

  parts.push('');
  parts.push('The user has provided the following instruction alongside the skill invocation:');
  parts.push(userInstruction);

  return parts.join('\n');
}

export function buildPreloadedSkillsPrompt(skillNames: string[]): string {
  const lines: string[] = [
    '## Preloaded Skills (session-level)',
    '',
    'The following skills are active for this session:',
  ];
  for (const name of skillNames) {
    lines.push(`- ${name}`);
  }
  return lines.join('\n');
}
