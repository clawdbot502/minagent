import { describe, expect, test } from 'bun:test';
import { getToolResultsKey } from './toolResults.js';

describe('getToolResultsKey', () => {
  test('matches the key used to store a batch of tool results', () => {
    expect(getToolResultsKey([
      { id: 'call_1', name: 'BashTool', arguments: {} },
      { id: 'call_2', name: 'FileReadTool', arguments: {} },
    ])).toBe('call_1,call_2');
  });

  test('returns null when there are no tool calls', () => {
    expect(getToolResultsKey(undefined)).toBeNull();
    expect(getToolResultsKey([])).toBeNull();
  });
});
