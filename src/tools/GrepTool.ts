import { spawnSync } from 'child_process';
import { z } from 'zod';
import type { Tool } from './types.js';

export const GrepToolSchema = z.object({
  pattern: z.string().describe('Regex pattern to search for'),
  path: z.string().optional().describe('Directory or file to search in (default: current directory)'),
  include: z.string().optional().describe('Glob pattern for files to include (e.g. "*.ts")'),
  exclude: z.string().optional().describe('Glob pattern for files to exclude'),
  case_sensitive: z.boolean().optional().describe('Case sensitive search (default: true)'),
  context_lines: z.number().optional().describe('Number of context lines to show around each match (default: 2)'),
});

export const GrepTool: Tool<typeof GrepToolSchema> = {
  name: 'GrepTool',
  description: 'Search file contents using ripgrep. Fast regex-based text search across the codebase. Prefer this over BashTool for searching code.',
  schema: GrepToolSchema,
  async execute(args) {
    try {
      const cmdArgs: string[] = [];

      if (!args.case_sensitive) {
        cmdArgs.push('-i');
      }

      cmdArgs.push('--line-number');
      cmdArgs.push('--color=never');
      cmdArgs.push('--max-count=5');
      cmdArgs.push('--max-columns=400');

      const contextLines = args.context_lines ?? 2;
      if (contextLines > 0) {
        cmdArgs.push('-C', String(contextLines));
      }

      if (args.include) {
        cmdArgs.push('-g', args.include);
      }
      if (args.exclude) {
        cmdArgs.push('-g', `!${args.exclude}`);
      }

      // Exclude common non-source directories by default
      cmdArgs.push('-g', '!node_modules');
      cmdArgs.push('-g', '!dist');
      cmdArgs.push('-g', '!build');
      cmdArgs.push('-g', '!.git');

      cmdArgs.push('-e', args.pattern);

      if (args.path) {
        cmdArgs.push(args.path);
      } else {
        cmdArgs.push('.');
      }

      const result = spawnSync('rg', cmdArgs, {
        encoding: 'utf-8',
        maxBuffer: 5 * 1024 * 1024,
        timeout: 30000,
      });
      if (result.error) {
        return result.error.message.includes('ENOENT')
          ? 'Error: ripgrep (rg) not installed. Install it first.'
          : `Error: ${result.error.message}`;
      }
      if (result.status === 1) return '(no matches)';
      if (result.status !== 0) {
        return `Error: ${result.stderr || `rg exited with code ${result.status}`}`;
      }

      const output = result.stdout || '';
      const lines = output.split('\n').filter((l) => l.trim());
      if (lines.length > 300) {
        return lines.slice(0, 300).join('\n') + `\n... [${lines.length - 300} more lines]`;
      }
      return output || '(no matches)';
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
};
