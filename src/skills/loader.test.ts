import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SkillRegistry } from './registry.js';
import { loadSkillsFromDir } from './loader.js';

let tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'minagent-skills-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe('loadSkillsFromDir', () => {
  test('reports invalid skill modules instead of silently skipping them', async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'broken.mjs'), 'throw new Error("boom");');

    const result = await loadSkillsFromDir(dir, new SkillRegistry());

    expect(result.loaded).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('boom');
  });

  test('reports duplicate skill names', async () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'one.mjs'), 'export default { name: "dup", description: "one", prompt: "one" };');
    writeFileSync(join(dir, 'two.mjs'), 'export default { name: "dup", description: "two", prompt: "two" };');

    const result = await loadSkillsFromDir(dir, new SkillRegistry());

    expect(result.loaded).toBe(2);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]?.name).toBe('dup');
  });
});
