import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { skillManage } from './manager.js';
import { findSkillDir } from './discovery.js';

let originalHome: string | undefined;
let tempHome: string;

beforeEach(() => {
  originalHome = process.env.HOME;
  tempHome = mkdtempSync(join(tmpdir(), 'minagent-skills-v2-'));
  process.env.HOME = tempHome;
});

afterEach(() => {
  process.env.HOME = originalHome;
  rmSync(tempHome, { recursive: true, force: true });
});

const validSkill = `---
name: test-skill
description: A test skill for unit tests
---
# Test Skill
Do something useful.
`;

describe('skillManage', () => {
  test('create succeeds with valid content', async () => {
    const result = await skillManage({ action: 'create', name: 'test-skill', content: validSkill });
    expect(result).toContain('Created skill');
    expect(findSkillDir('test-skill')).not.toBeNull();
  });

  test('create fails when skill already exists', async () => {
    await skillManage({ action: 'create', name: 'dup-skill', content: validSkill });
    const result = await skillManage({ action: 'create', name: 'dup-skill', content: validSkill });
    expect(result).toContain('already exists');
  });

  test('create rejects invalid name', async () => {
    const result = await skillManage({ action: 'create', name: 'BAD NAME', content: validSkill });
    expect(result).toContain('Error');
  });

  test('edit rewrites SKILL.md', async () => {
    await skillManage({ action: 'create', name: 'edit-skill', content: validSkill });
    const newContent = `---\nname: edit-skill\ndescription: Updated\n---\nUpdated body.`;
    const result = await skillManage({ action: 'edit', name: 'edit-skill', content: newContent });
    expect(result).toContain('Edited');
  });

  test('patch replaces string', async () => {
    await skillManage({ action: 'create', name: 'patch-skill', content: validSkill });
    const result = await skillManage({
      action: 'patch',
      name: 'patch-skill',
      oldString: 'Do something useful.',
      newString: 'Do something amazing.',
    });
    expect(result).toContain('Patched');
  });

  test('patch rejects missing old_string', async () => {
    await skillManage({ action: 'create', name: 'patch2-skill', content: validSkill });
    const result = await skillManage({
      action: 'patch',
      name: 'patch2-skill',
      oldString: 'not found',
      newString: 'replacement',
    });
    expect(result).toContain('not found');
  });

  test('write_file creates supporting file', async () => {
    await skillManage({ action: 'create', name: 'wf-skill', content: validSkill });
    const result = await skillManage({
      action: 'write_file',
      name: 'wf-skill',
      filePath: 'references/doc.md',
      fileContent: '# Reference\nDetails here.',
    });
    expect(result).toContain('Wrote supporting file');
  });

  test('write_file rejects bad path', async () => {
    await skillManage({ action: 'create', name: 'wf2-skill', content: validSkill });
    const result = await skillManage({
      action: 'write_file',
      name: 'wf2-skill',
      filePath: '../escape.md',
      fileContent: 'bad',
    });
    expect(result).toContain('Path traversal');
  });

  test('remove_file deletes supporting file', async () => {
    await skillManage({ action: 'create', name: 'rf-skill', content: validSkill });
    await skillManage({
      action: 'write_file',
      name: 'rf-skill',
      filePath: 'templates/tmpl.ts',
      fileContent: 'export const x = 1;',
    });
    const result = await skillManage({
      action: 'remove_file',
      name: 'rf-skill',
      filePath: 'templates/tmpl.ts',
    });
    expect(result).toContain('Removed');
  });

  test('delete removes skill directory', async () => {
    await skillManage({ action: 'create', name: 'del-skill', content: validSkill });
    const result = await skillManage({ action: 'delete', name: 'del-skill' });
    expect(result).toContain('Deleted');
    expect(findSkillDir('del-skill')).toBeNull();
  });

  test('create with category places skill correctly', async () => {
    const result = await skillManage({
      action: 'create',
      name: 'cat-skill',
      category: 'testing',
      content: validSkill,
    });
    expect(result).toContain('Created skill');
    const dir = findSkillDir('cat-skill');
    expect(dir).toContain('/testing/cat-skill');
  });
});
