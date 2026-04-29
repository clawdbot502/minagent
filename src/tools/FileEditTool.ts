import { readFileSync, writeFileSync } from 'fs';
import { z } from 'zod';
import type { Tool } from './types.js';
import { EditHistory } from '../utils/editHistory.js';
import { getCurrentChangeset } from '../utils/changeset.js';

// Global edit history for undo/redo support
export const globalEditHistory = new EditHistory();

export const FileEditToolSchema = z.object({
  file_path: z.string().describe('Absolute path to the file to edit'),
  old_string: z.string().describe('The exact string to replace. Must be unique in the file.'),
  new_string: z.string().describe('The replacement string.'),
});

function computeDiff(filePath: string, oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const lines: string[] = [`--- ${filePath} (before)`, `+++ ${filePath} (after)`];

  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i++;
      j++;
      continue;
    }
    // Find next matching line
    let found = false;
    for (let lookAhead = 1; lookAhead <= 3 && !found; lookAhead++) {
      if (i + lookAhead < oldLines.length && j < newLines.length && oldLines[i + lookAhead] === newLines[j]) {
        for (let k = 0; k < lookAhead; k++) lines.push(`- ${oldLines[i + k]}`);
        i += lookAhead;
        found = true;
      } else if (i < oldLines.length && j + lookAhead < newLines.length && oldLines[i] === newLines[j + lookAhead]) {
        for (let k = 0; k < lookAhead; k++) lines.push(`+ ${newLines[j + k]}`);
        j += lookAhead;
        found = true;
      }
    }
    if (!found) {
      if (i < oldLines.length) { lines.push(`- ${oldLines[i]}`); i++; }
      else if (j < newLines.length) { lines.push(`+ ${newLines[j]}`); j++; }
    }
  }

  return lines.join('\n');
}

/**
 * Find all occurrences of a substring and return their positions with context.
 */
function findOccurrences(content: string, search: string): Array<{ index: number; line: number; context: string }> {
  const results: Array<{ index: number; line: number; context: string }> = [];
  let index = 0;

  while ((index = content.indexOf(search, index)) !== -1) {
    const before = content.slice(0, index);
    const line = before.split('\n').length;
    const lineStart = before.lastIndexOf('\n') + 1;
    const lineEnd = content.indexOf('\n', index + search.length);
    const context = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    results.push({ index, line, context });
    index += 1;
  }

  return results;
}

export const FileEditTool: Tool<typeof FileEditToolSchema> = {
  name: 'FileEditTool',
  description: 'Replace a unique string in a file with another string. Use for precise edits. Supports undo via /undo command.',
  schema: FileEditToolSchema,
  async execute(args) {
    try {
      const content = readFileSync(args.file_path, 'utf-8');
      const occurrences = findOccurrences(content, args.old_string);

      if (occurrences.length === 0) {
        // Try to find similar strings to help the LLM
        const lines = content.split('\n');
        const suggestions: string[] = [];
        const searchTrimmed = args.old_string.trim();

        for (let i = 0; i < lines.length; i++) {
          if (lines[i]!.includes(searchTrimmed.slice(0, Math.min(20, searchTrimmed.length)))) {
            suggestions.push(`  Line ${i + 1}: ${lines[i]!.slice(0, 120)}`);
            if (suggestions.length >= 5) break;
          }
        }

        let msg = `Error: old_string not found in ${args.file_path}`;
        if (suggestions.length > 0) {
          msg += `\n\nPossible similar lines:\n${suggestions.join('\n')}`;
        }
        return msg;
      }

      if (occurrences.length > 1) {
        const contexts = occurrences.map((o) => `  Line ${o.line}: ${o.context.slice(0, 120)}`).join('\n');
        return `Error: old_string appears ${occurrences.length} times in ${args.file_path}. Must be unique.\n\nOccurrences:\n${contexts}`;
      }

      const newContent = content.replace(args.old_string, args.new_string);

      // Validate: ensure the replacement actually happened
      if (newContent === content) {
        return `Error: Replacement had no effect. old_string and new_string may be identical.`;
      }

      writeFileSync(args.file_path, newContent, 'utf-8');

      // Record for undo and changeset
      globalEditHistory.record({
        filePath: args.file_path,
        originalContent: content,
        newContent,
        timestamp: new Date().toISOString(),
      });
      getCurrentChangeset().record({
        filePath: args.file_path,
        action: 'modified',
        originalContent: content,
        newContent,
        timestamp: new Date().toISOString(),
      });

      const diff = computeDiff(args.file_path, content, newContent);
      const lineCount = newContent.split('\n').length - content.split('\n').length;
      const lineChange = lineCount > 0 ? `+${lineCount} lines` : lineCount < 0 ? `${lineCount} lines` : '0 lines';

      return `Successfully edited ${args.file_path} (${lineChange})\n\nDiff:\n${diff}`;
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
};
