import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  readdirSync,
  rmdirSync,
} from 'fs';
import { join, dirname } from 'path';
import type { SkillManageArgs } from './types.js';
import {
  MAX_CONTENT_LEN,
  MAX_SUPPORTING_FILE_SIZE,
} from './types.js';
import {
  getSkillsRoot,
  getSkillDir,
  getArchiveDir,
  validateSkillName,
  validateSkillMetadata,
  parseFrontmatter,
  buildSkillMetadata,
  hasTraversalComponent,
  isAllowedSupportingPath,
  validateWithinDir,
  scanForInjection,
  readSkillMd,
} from './utils.js';
import { findSkillDir, discoverLinkedFiles } from './discovery.js';
import {
  bumpPatch,
  deleteUsage,
  isPinned,
} from './telemetry.js';
import { clearSkillsSystemPromptCache } from './prompt.js';

function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + '.tmp';
  writeFileSync(tmp, content, 'utf-8');
  writeFileSync(path, readFileSync(tmp, 'utf-8'), 'utf-8');
  try {
    require('fs').unlinkSync(tmp);
  } catch {
    // ignore
  }
}

function atomicRollback(path: string, original: string | null): void {
  if (original === null) {
    try {
      require('fs').unlinkSync(path);
    } catch {
      // ignore
    }
  } else {
    writeFileSync(path, original, 'utf-8');
  }
}

function removeDirIfEmpty(dir: string): void {
  try {
    const entries = readdirSync(dir);
    if (entries.length === 0) {
      rmdirSync(dir);
    }
  } catch {
    // ignore
  }
}

function validateSkillContent(content: string): string | null {
  if (!content.includes('---')) {
    return 'SKILL.md must contain YAML frontmatter delimited by ---';
  }
  const { metadata, body } = parseFrontmatter(content);
  if (Object.keys(metadata).length === 0) {
    return 'SKILL.md must have a YAML frontmatter block';
  }
  const meta = buildSkillMetadata(metadata);
  const err = validateSkillMetadata(meta);
  if (err) return err;
  if (!body.trim()) {
    return 'SKILL.md must have body content after frontmatter';
  }
  if (content.length > MAX_CONTENT_LEN) {
    return `Content exceeds ${MAX_CONTENT_LEN} characters`;
  }
  const injection = scanForInjection(content);
  if (injection) return `Security scan failed: ${injection}`;
  return null;
}

function doCreate(args: SkillManageArgs): string {
  const nameErr = validateSkillName(args.name);
  if (nameErr) return `Error: ${nameErr}`;

  if (!args.content) return 'Error: content is required for create';
  const contentErr = validateSkillContent(args.content);
  if (contentErr) return `Error: ${contentErr}`;

  const skillDir = getSkillDir(args.name, args.category);
  if (existsSync(skillDir)) {
    return `Error: Skill "${args.name}" already exists at ${skillDir}`;
  }

  mkdirSync(skillDir, { recursive: true });

  try {
    atomicWrite(join(skillDir, 'SKILL.md'), args.content);
  } catch (err: any) {
    rmSync(skillDir, { recursive: true, force: true });
    return `Error: Failed to write SKILL.md — ${err.message}`;
  }

  clearSkillsSystemPromptCache(true);
  return `Created skill "${args.name}" at ${skillDir}\nUse /${args.name} to invoke it.`;
}

function doPatch(args: SkillManageArgs): string {
  if (isPinned(args.name)) {
    return `Error: Skill "${args.name}" is pinned. Unpin it first.`;
  }

  const skillDir = findSkillDir(args.name);
  if (!skillDir) return `Error: Skill "${args.name}" not found.`;

  const targetFile = args.filePath
    ? join(skillDir, args.filePath)
    : join(skillDir, 'SKILL.md');

  if (args.filePath) {
    if (hasTraversalComponent(args.filePath)) {
      return 'Error: Path traversal detected.';
    }
    if (!isAllowedSupportingPath(args.filePath)) {
      return 'Error: file_path must be under references/, templates/, scripts/, or assets/.';
    }
    if (!validateWithinDir(targetFile, skillDir)) {
      return 'Error: file_path escapes skill directory.';
    }
  }

  if (!existsSync(targetFile)) {
    return `Error: Target file does not exist: ${targetFile}`;
  }

  const original = readFileSync(targetFile, 'utf-8');
  const oldStr = args.oldString || '';
  const newStr = args.newString || '';

  const count = original.split(oldStr).length - 1;
  if (count === 0) {
    return 'Error: old_string not found in target file.';
  }
  if (count > 1 && !args.replaceAll) {
    return `Error: old_string appears ${count} times. Set replace_all=true to replace all, or make it unique.`;
  }

  const patched = args.replaceAll
    ? original.split(oldStr).join(newStr)
    : original.replace(oldStr, newStr);

  // Validate SKILL.md after patch
  if (!args.filePath) {
    const validation = validateSkillContent(patched);
    if (validation) {
      atomicRollback(targetFile, original);
      return `Error: Patch broke frontmatter — ${validation}. Rolled back.`;
    }
  }

  try {
    atomicWrite(targetFile, patched);
  } catch (err: any) {
    atomicRollback(targetFile, original);
    return `Error: Write failed — ${err.message}. Rolled back.`;
  }

  bumpPatch(args.name);
  clearSkillsSystemPromptCache(true);
  return `Patched "${args.name}" (${args.filePath || 'SKILL.md'}).`;
}

function doEdit(args: SkillManageArgs): string {
  if (isPinned(args.name)) {
    return `Error: Skill "${args.name}" is pinned. Unpin it first.`;
  }

  const skillDir = findSkillDir(args.name);
  if (!skillDir) return `Error: Skill "${args.name}" not found.`;

  if (!args.content) return 'Error: content is required for edit';
  const err = validateSkillContent(args.content);
  if (err) return `Error: ${err}`;

  const targetFile = join(skillDir, 'SKILL.md');
  const original = readFileSync(targetFile, 'utf-8');

  try {
    atomicWrite(targetFile, args.content);
  } catch (writeErr: any) {
    atomicRollback(targetFile, original);
    return `Error: Write failed — ${writeErr.message}. Rolled back.`;
  }

  bumpPatch(args.name);
  clearSkillsSystemPromptCache(true);
  return `Edited "${args.name}" (full rewrite of SKILL.md).`;
}

function doDelete(args: SkillManageArgs): string {
  if (isPinned(args.name)) {
    return `Error: Skill "${args.name}" is pinned. Unpin it first.`;
  }

  const skillDir = findSkillDir(args.name);
  if (!skillDir) return `Error: Skill "${args.name}" not found.`;

  try {
    rmSync(skillDir, { recursive: true, force: true });
  } catch (err: any) {
    return `Error: Failed to delete — ${err.message}`;
  }

  // Clean up empty category dir
  if (skillDir.includes('/skills/')) {
    const parts = skillDir.split('/skills/')[1];
    if (parts) {
      const categoryPart = parts.split('/')[0];
      if (categoryPart && categoryPart !== args.name) {
        removeDirIfEmpty(join(getSkillsRoot(), categoryPart));
      }
    }
  }

  deleteUsage(args.name);
  clearSkillsSystemPromptCache(true);
  return `Deleted skill "${args.name}".`;
}

function doWriteFile(args: SkillManageArgs): string {
  if (isPinned(args.name)) {
    return `Error: Skill "${args.name}" is pinned. Unpin it first.`;
  }

  const skillDir = findSkillDir(args.name);
  if (!skillDir) return `Error: Skill "${args.name}" not found.`;

  if (!args.filePath) return 'Error: file_path is required for write_file';
  if (!args.fileContent) return 'Error: file_content is required for write_file';

  if (hasTraversalComponent(args.filePath)) {
    return 'Error: Path traversal detected.';
  }
  if (!isAllowedSupportingPath(args.filePath)) {
    return 'Error: file_path must be under references/, templates/, scripts/, or assets/.';
  }

  const target = join(skillDir, args.filePath);
  if (!validateWithinDir(target, skillDir)) {
    return 'Error: file_path escapes skill directory.';
  }

  if (args.fileContent.length > MAX_SUPPORTING_FILE_SIZE) {
    return `Error: file_content exceeds ${MAX_SUPPORTING_FILE_SIZE} bytes`;
  }

  const original = existsSync(target) ? readFileSync(target, 'utf-8') : null;

  try {
    atomicWrite(target, args.fileContent);
  } catch (err: any) {
    atomicRollback(target, original);
    return `Error: Write failed — ${err.message}. Rolled back.`;
  }

  bumpPatch(args.name);
  clearSkillsSystemPromptCache(true);
  return `Wrote supporting file "${args.filePath}" for "${args.name}".`;
}

function doRemoveFile(args: SkillManageArgs): string {
  if (isPinned(args.name)) {
    return `Error: Skill "${args.name}" is pinned. Unpin it first.`;
  }

  const skillDir = findSkillDir(args.name);
  if (!skillDir) return `Error: Skill "${args.name}" not found.`;

  if (!args.filePath) return 'Error: file_path is required for remove_file';

  if (hasTraversalComponent(args.filePath)) {
    return 'Error: Path traversal detected.';
  }
  if (!isAllowedSupportingPath(args.filePath)) {
    return 'Error: file_path must be under references/, templates/, scripts/, or assets/.';
  }

  const target = join(skillDir, args.filePath);
  if (!validateWithinDir(target, skillDir)) {
    return 'Error: file_path escapes skill directory.';
  }

  if (!existsSync(target)) {
    return `Error: File "${args.filePath}" does not exist.`;
  }

  try {
    require('fs').unlinkSync(target);
  } catch (err: any) {
    return `Error: Failed to remove — ${err.message}`;
  }

  bumpPatch(args.name);
  clearSkillsSystemPromptCache(true);
  return `Removed "${args.filePath}" from "${args.name}".`;
}

export async function skillManage(args: SkillManageArgs): Promise<string> {
  switch (args.action) {
    case 'create':
      return doCreate(args);
    case 'patch':
      return doPatch(args);
    case 'edit':
      return doEdit(args);
    case 'delete':
      return doDelete(args);
    case 'write_file':
      return doWriteFile(args);
    case 'remove_file':
      return doRemoveFile(args);
    default:
      return `Error: Unknown action: ${(args as any).action}`;
  }
}
