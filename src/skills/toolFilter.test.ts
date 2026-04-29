import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import type { ToolRegistry } from '../tools/types.js';
import { filterToolsForSkill } from './toolFilter.js';

const tools: ToolRegistry = {
  FileReadTool: {
    name: 'FileReadTool',
    description: 'read',
    schema: z.object({}),
    execute: async () => 'read',
  },
  FileWriteTool: {
    name: 'FileWriteTool',
    description: 'write',
    schema: z.object({}),
    execute: async () => 'write',
  },
};

describe('filterToolsForSkill', () => {
  test('returns all tools when no skill allowlist is set', () => {
    expect(Object.keys(filterToolsForSkill(tools))).toEqual(['FileReadTool', 'FileWriteTool']);
  });

  test('limits tools to the active skill allowlist', () => {
    const filtered = filterToolsForSkill(tools, {
      name: 'review',
      description: 'review code',
      prompt: 'review',
      tools: ['FileReadTool'],
    });

    expect(Object.keys(filtered)).toEqual(['FileReadTool']);
  });
});
