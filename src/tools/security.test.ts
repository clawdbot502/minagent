import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, test } from 'bun:test';
import { GrepTool } from './GrepTool.js';
import { GlobTool } from './GlobTool.js';
import { DESTRUCTIVE_TOOLS, READONLY_TOOLS } from './index.js';

describe('tool command execution safety', () => {
  test('GrepTool does not execute shell metacharacters from the pattern', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minagent-grep-test-'));
    const marker = join(dir, 'shell-injection-created');
    try {
      await GrepTool.execute({
        pattern: `definitely-no-match; touch ${marker} #`,
        path: dir,
      });

      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('GlobTool does not execute shell metacharacters from the pattern', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minagent-glob-test-'));
    const marker = join(dir, 'shell-injection-created');
    try {
      await GlobTool.execute({
        pattern: `*.ts; touch ${marker} #`,
        path: dir,
      });

      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('mutating and extension tools require permission by default', () => {
    expect(DESTRUCTIVE_TOOLS.has('NotebookEditTool')).toBe(true);
    expect(DESTRUCTIVE_TOOLS.has('MCPTool')).toBe(true);
    expect(READONLY_TOOLS.has('NotebookEditTool')).toBe(false);
    expect(READONLY_TOOLS.has('MCPTool')).toBe(false);
  });
});
