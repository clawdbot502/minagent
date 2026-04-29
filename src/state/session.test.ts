import { describe, expect, test } from 'bun:test';
import { shouldLoadSessionState } from './session.js';

describe('shouldLoadSessionState', () => {
  test('allows sessions from the current working directory', () => {
    expect(shouldLoadSessionState({ cwd: '/repo/a' }, '/repo/a')).toBe(true);
  });

  test('blocks sessions saved from another working directory by default', () => {
    expect(shouldLoadSessionState({ cwd: '/repo/a' }, '/repo/b')).toBe(false);
  });

  test('can explicitly allow cross-directory session loading', () => {
    expect(shouldLoadSessionState({ cwd: '/repo/a' }, '/repo/b', true)).toBe(true);
  });
});
