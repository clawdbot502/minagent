import { spawnSync } from 'child_process';
import { z } from 'zod';
import type { Tool } from './types.js';

export const GlobToolSchema = z.object({
  pattern: z.string().describe('Glob pattern to match files (e.g. "src/**/*.ts")'),
  path: z.string().optional().describe('Directory to search in (default: current directory)'),
  exclude: z.string().optional().describe('Glob pattern for files to exclude'),
  limit: z.number().optional().describe('Maximum number of results (default: 100)'),
});

export const GlobTool: Tool<typeof GlobToolSchema> = {
  name: 'GlobTool',
  description: 'Find files matching a glob pattern. Use for discovering files by name pattern.',
  schema: GlobToolSchema,
  async execute(args) {
    try {
      const limit = args.limit || 100;
      const findResult = spawnSync('find', [args.path || '.', '-type', 'f'], {
        encoding: 'utf-8',
        maxBuffer: 5 * 1024 * 1024,
        timeout: 30000,
      });
      if (findResult.error) return `Error: ${findResult.error.message}`;
      if (findResult.status !== 0) {
        return `Error: ${findResult.stderr || `find exited with code ${findResult.status}`}`;
      }

      const regex = globToRegex(args.pattern);
      const excluded = args.exclude ? globToRegex(args.exclude) : null;
      const result = (findResult.stdout || '')
        .split('\n')
        .filter((l) => l.trim())
        .filter((l) => regex.test(l))
        .filter((l) => !excluded?.test(l))
        .slice(0, limit)
        .join('\n');

      const lines = result.split('\n').filter((l) => l.trim());
      if (lines.length === 0) return '(no files found)';
      if (lines.length >= limit) {
        return lines.join('\n') + `\n... [showing first ${limit} results]`;
      }
      return lines.join('\n');
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
};

function globToRegex(pattern: string): RegExp {
  let regex = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]!;
    if (char === '*' && pattern[i + 1] === '*') {
      regex += '.*';
      i++;
    } else if (char === '*') {
      regex += '[^/]*';
    } else if (char === '?') {
      regex += '[^/]';
    } else {
      regex += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(regex);
}
