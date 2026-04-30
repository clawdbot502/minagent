import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function substituteTemplateVars(
  content: string,
  skillDir: string,
  sessionId?: string
): string {
  return content
    .replace(/\$\{MINA_SKILL_DIR\}/g, skillDir)
    .replace(/\$\{MINA_SESSION_ID\}/g, sessionId || 'default');
}

// Inline shell expansion disabled by default for security
export function expandInlineShell(
  content: string,
  _skillDir: string,
  _enabled = false
): string {
  if (!_enabled) return content;
  // Pattern: `!`command``
  return content.replace(/!`([^`]+)`/g, (_match, cmd) => {
    try {
      const result = require('child_process').execSync(cmd, {
        cwd: _skillDir,
        timeout: 10000,
        encoding: 'utf-8',
        maxBuffer: 4000,
      });
      return result.trim();
    } catch (err: any) {
      return `[inline-shell error: ${err.message}]`;
    }
  });
}

export function preprocessSkillContent(
  content: string,
  skillDir: string,
  sessionId?: string,
  options?: { templateVars?: boolean; inlineShell?: boolean }
): string {
  let result = content;
  if (options?.templateVars !== false) {
    result = substituteTemplateVars(result, skillDir, sessionId);
  }
  if (options?.inlineShell) {
    result = expandInlineShell(result, skillDir, true);
  }
  return result;
}

export function loadSupportingFile(
  skillDir: string,
  filePath: string
): string | null {
  const fullPath = join(skillDir, filePath);
  if (!existsSync(fullPath)) return null;
  try {
    return readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}
