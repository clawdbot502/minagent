import { describe, expect, test, beforeEach } from 'bun:test';
import { skillScopeManager } from './scope.js';

describe('SkillScopeManager', () => {
  beforeEach(() => {
    skillScopeManager.exitAll('cleanup');
  });

  test('enter creates scope and returns id', () => {
    const id = skillScopeManager.enter('my-skill', 'turn');
    expect(id).toContain('scope-');
    expect(skillScopeManager.isActive('my-skill')).toBe(true);
  });

  test('exit marks scope inactive', () => {
    const id = skillScopeManager.enter('my-skill', 'turn');
    expect(skillScopeManager.isActive('my-skill')).toBe(true);
    skillScopeManager.exit(id);
    expect(skillScopeManager.isActive('my-skill')).toBe(false);
  });

  test('activeScopes returns only active', () => {
    skillScopeManager.enter('skill-a', 'turn');
    const id2 = skillScopeManager.enter('skill-b', 'session');
    skillScopeManager.exit(id2);
    const active = skillScopeManager.activeScopes();
    expect(active).toHaveLength(1);
    expect(active[0]?.skillName).toBe('skill-a');
  });

  test('getActiveSkillNames deduplicates', () => {
    skillScopeManager.enter('skill-a', 'turn');
    skillScopeManager.enter('skill-a', 'turn');
    const names = skillScopeManager.getActiveSkillNames();
    expect(names).toEqual(['skill-a']);
  });

  test('exitTurnScopes only exits turn scopes', () => {
    skillScopeManager.enter('turn-skill', 'turn');
    skillScopeManager.enter('session-skill', 'session');
    skillScopeManager.exitTurnScopes();
    expect(skillScopeManager.isActive('turn-skill')).toBe(false);
    expect(skillScopeManager.isActive('session-skill')).toBe(true);
    skillScopeManager.exitAll();
  });

  test('exitAll cleans everything', () => {
    skillScopeManager.enter('a', 'turn');
    skillScopeManager.enter('b', 'session');
    skillScopeManager.exitAll();
    expect(skillScopeManager.activeScopes()).toHaveLength(0);
  });
});
