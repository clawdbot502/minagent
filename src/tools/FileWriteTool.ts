import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { z } from 'zod';
import type { Tool } from './types.js';
import { globalEditHistory } from './FileEditTool.js';
import { getCurrentChangeset } from '../utils/changeset.js';

export const FileWriteToolSchema = z.object({
  file_path: z.string().describe('Absolute path to the file to write'),
  content: z.string().describe('Content to write to the file'),
});

function simpleDiff(filePath: string, oldContent: string | null, newContent: string): string {
  if (!oldContent) {
    const lines = newContent.split('\n');
    return `+++ ${filePath} (new file, ${lines.length} lines)\n` +
           lines.slice(0, 20).map((l) => `+ ${l}`).join('\n') +
           (lines.length > 20 ? `\n+ ... (${lines.length - 20} more lines)` : '');
  }

  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const lines: string[] = [`--- ${filePath} (before)`, `+++ ${filePath} (after)`];

  let i = 0, j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i++; j++; continue;
    }
    let found = false;
    for (let lookAhead = 1; lookAhead <= 3 && !found; lookAhead++) {
      if (i + lookAhead < oldLines.length && j < newLines.length && oldLines[i + lookAhead] === newLines[j]) {
        for (let k = 0; k < lookAhead; k++) lines.push(`- ${oldLines[i + k]}`);
        i += lookAhead; found = true;
      } else if (i < oldLines.length && j + lookAhead < newLines.length && oldLines[i] === newLines[j + lookAhead]) {
        for (let k = 0; k < lookAhead; k++) lines.push(`+ ${newLines[j + k]}`);
        j += lookAhead; found = true;
      }
    }
    if (!found) {
      if (i < oldLines.length) { lines.push(`- ${oldLines[i]}`); i++; }
      else if (j < newLines.length) { lines.push(`+ ${newLines[j]}`); j++; }
    }
  }
  return lines.join('\n');
}

export const FileWriteTool: Tool<typeof FileWriteToolSchema> = {
  name: 'FileWriteTool',
  description: 'Write content to a file. Creates new files (including parent directories) or overwrites existing ones. Returns a diff preview.',
  schema: FileWriteToolSchema,
  async execute(args) {
    try {
      const existed = existsSync(args.file_path);
      const oldContent = existed ? readFileSync(args.file_path, 'utf-8') : null;

      mkdirSync(dirname(args.file_path), { recursive: true });
      writeFileSync(args.file_path, args.content, 'utf-8');

      // Record overwrite for undo and changeset
      if (existed && oldContent !== null) {
        globalEditHistory.record({
          filePath: args.file_path,
          originalContent: oldContent,
          newContent: args.content,
          timestamp: new Date().toISOString(),
        });
        getCurrentChangeset().record({
          filePath: args.file_path,
          action: 'modified',
          originalContent: oldContent,
          newContent: args.content,
          timestamp: new Date().toISOString(),
        });
      } else {
        getCurrentChangeset().record({
          filePath: args.file_path,
          action: 'created',
          originalContent: null,
          newContent: args.content,
          timestamp: new Date().toISOString(),
        });
      }

      const diff = simpleDiff(args.file_path, oldContent, args.content);
      const action = existed ? 'Overwritten' : 'Created';
      const lineCount = args.content.split('\n').length;

      return `${action} ${args.file_path} (${lineCount} lines)\n\n${diff}`;
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
};
