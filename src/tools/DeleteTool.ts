import { rmSync, existsSync, readFileSync } from 'fs';
import { z } from 'zod';
import type { Tool } from './types.js';
import { getCurrentChangeset } from '../utils/changeset.js';

export const DeleteToolSchema = z.object({
  file_path: z.string().describe('Absolute path to the file or directory to delete'),
  recursive: z.boolean().optional().describe('Delete directories recursively (default: false)'),
});

export const DeleteTool: Tool<typeof DeleteToolSchema> = {
  name: 'DeleteTool',
  description: 'Delete a file or directory. Use recursive:true for directories. Deleted files are tracked for session review.',
  schema: DeleteToolSchema,
  async execute(args) {
    try {
      if (!existsSync(args.file_path)) {
        return `Error: ${args.file_path} does not exist`;
      }

      // Try to capture original content for tracking
      let originalContent: string | null = null;
      try {
        originalContent = readFileSync(args.file_path, 'utf-8');
      } catch {
        // Probably a directory or binary file
      }

      rmSync(args.file_path, { recursive: args.recursive || false });

      getCurrentChangeset().record({
        filePath: args.file_path,
        action: 'deleted',
        originalContent,
        newContent: null,
        timestamp: new Date().toISOString(),
      });

      return `Successfully deleted ${args.file_path}`;
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  },
};
