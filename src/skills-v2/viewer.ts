import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { SkillViewArgs, SkillLoadResult } from './types.js';
import {
  readSkillMd,
  parseFrontmatter,
  buildSkillMetadata,
  validateWithinDir,
  isAllowedSupportingPath,
  hasTraversalComponent,
} from './utils.js';
import { findSkillDir, discoverLinkedFiles } from './discovery.js';
import { bumpView } from './telemetry.js';
import { preprocessSkillContent, loadSupportingFile } from './preprocess.js';
import { skillScopeManager } from './scope.js';

export async function skillView(args: SkillViewArgs): Promise<string> {
  const skillDir = findSkillDir(args.name);
  if (!skillDir) {
    return `Error: Skill "${args.name}" not found.`;
  }

  // Load specific supporting file if requested
  if (args.filePath) {
    if (hasTraversalComponent(args.filePath)) {
      return `Error: Path traversal detected in file_path.`;
    }
    if (!isAllowedSupportingPath(args.filePath)) {
      return `Error: file_path must be under references/, templates/, scripts/, or assets/.`;
    }
    const target = join(skillDir, args.filePath);
    if (!validateWithinDir(target, skillDir)) {
      return `Error: file_path escapes skill directory.`;
    }
    const content = loadSupportingFile(skillDir, args.filePath);
    if (content === null) {
      return `Error: Supporting file "${args.filePath}" not found.`;
    }
    bumpView(args.name);
    return content;
  }

  // Load SKILL.md
  const raw = readSkillMd(skillDir);
  if (!raw) {
    return `Error: Could not read SKILL.md for "${args.name}".`;
  }

  const { metadata, body } = parseFrontmatter(raw);
  const meta = buildSkillMetadata(metadata);
  const linkedFiles = discoverLinkedFiles(skillDir);
  const processed = preprocessSkillContent(body, skillDir);

  bumpView(args.name);

  // Enter scope if not already active for this skill
  const mode = args.mode || 'turn';
  if (!skillScopeManager.isActive(args.name)) {
    skillScopeManager.enter(args.name, mode, mode === 'session' ? processed : undefined);
  }

  const result: SkillLoadResult = {
    success: true,
    name: meta.name || args.name,
    description: meta.description,
    content: processed,
    skillDir,
    linkedFiles,
  };

  // Return LLM-friendly format with JSON at the end for structured access
  const parts: string[] = [
    `[SKILL LOADED: ${result.name}]`,
    `Description: ${result.description}`,
    '',
    '--- Skill Instructions ---',
    processed,
    '--- End Skill Instructions ---',
  ];

  if (linkedFiles.length > 0) {
    parts.push('', `Linked files: ${linkedFiles.join(', ')}`);
  }

  parts.push('', `[Scope: ${mode}. Use SkillExitTool to exit this skill.]`);
  parts.push('', '<skill_json>');
  parts.push(JSON.stringify(result, null, 2));
  parts.push('</skill_json>');

  return parts.join('\n');
}
