import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { skillManage } from './manager.js';
import { skillView } from './viewer.js';
import { getSkillIndex } from './discovery.js';
import { skillScopeManager } from './scope.js';
import { getUsage, setPinned } from './telemetry.js';
import { runCurator } from './curator.js';

let originalHome: string | undefined;
let tempHome: string;

beforeEach(() => {
  originalHome = process.env.HOME;
  tempHome = mkdtempSync(join(tmpdir(), 'minagent-e2e-'));
  process.env.HOME = tempHome;
  skillScopeManager.exitAll('test_cleanup');
});

afterEach(() => {
  process.env.HOME = originalHome;
  rmSync(tempHome, { recursive: true, force: true });
});

const sampleSkill = `---
name: react-component
description: Generate React components with proper TypeScript
tags: [frontend, react]
---
# React Component Skill

When asked to create a React component:
1. Use functional components
2. Add TypeScript interfaces for props
3. Export as default
`;

describe('skills-v2 e2e', () => {
  test('full lifecycle: create → list → view → scope → exit → delete', async () => {
    // Create
    const createResult = await skillManage({
      action: 'create',
      name: 'react-component',
      content: sampleSkill,
    });
    expect(createResult).toContain('Created');

    // List
    const index = getSkillIndex();
    expect(index.some((e) => e.name === 'react-component')).toBe(true);

    // View (enters turn scope)
    const viewResult = await skillView({ name: 'react-component' });
    expect(viewResult).toContain('React Component Skill');
    expect(viewResult).toContain('[SKILL LOADED: react-component]');
    expect(skillScopeManager.isActive('react-component')).toBe(true);

    // Exit
    skillScopeManager.exitAll('test');
    expect(skillScopeManager.isActive('react-component')).toBe(false);

    // Delete
    const deleteResult = await skillManage({ action: 'delete', name: 'react-component' });
    expect(deleteResult).toContain('Deleted');
  });

  test('session scope persists across turns', async () => {
    await skillManage({ action: 'create', name: 'session-skill', content: sampleSkill });

    const viewResult = await skillView({ name: 'session-skill', mode: 'session' });
    expect(viewResult).toContain('[Scope: session. Use SkillExitTool to exit this skill.]');
    expect(skillScopeManager.isActive('session-skill')).toBe(true);

    // Simulate turn completion — session scope should survive
    skillScopeManager.exitTurnScopes();
    expect(skillScopeManager.isActive('session-skill')).toBe(true);

    // Exit all should clear it
    skillScopeManager.exitAll('test');
    expect(skillScopeManager.isActive('session-skill')).toBe(false);
  });

  test('pinned skill cannot be deleted', async () => {
    await skillManage({ action: 'create', name: 'pinned-skill', content: sampleSkill });
    setPinned('pinned-skill', true);

    const deleteResult = await skillManage({ action: 'delete', name: 'pinned-skill' });
    expect(deleteResult).toContain('pinned');
    expect(existsSync(join(tempHome, '.minagent', 'skills', 'pinned-skill'))).toBe(true);
  });

  test('curator reviews skills and finds quality issues', async () => {
    // Create a low-quality skill (very short body)
    const lowQuality = `---\nname: bad-skill\ndescription: Bad\n---\nShort.`;
    await skillManage({ action: 'create', name: 'bad-skill', content: lowQuality });

    const result = runCurator();
    expect(result.reviewed).toBeGreaterThan(0);
    expect(result.issuesFound).toBeGreaterThan(0);
  });

  test('telemetry tracks views and usage', async () => {
    await skillManage({ action: 'create', name: 'telemetry-skill', content: sampleSkill });

    const before = getUsage('telemetry-skill');
    expect(before.viewCount).toBe(0);

    await skillView({ name: 'telemetry-skill' });

    const after = getUsage('telemetry-skill');
    expect(after.viewCount).toBe(1);
  });

  test('supporting file write and read', async () => {
    await skillManage({ action: 'create', name: 'ref-skill', content: sampleSkill });
    await skillManage({
      action: 'write_file',
      name: 'ref-skill',
      filePath: 'references/api.md',
      fileContent: '# API\nGET /users',
    });

    const supporting = await skillView({ name: 'ref-skill', filePath: 'references/api.md' });
    expect(supporting).toContain('GET /users');
  });
});
