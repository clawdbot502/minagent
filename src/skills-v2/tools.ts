import { z } from 'zod';
import type { Tool } from '../tools/types.js';
import { skillManage } from './manager.js';
import { skillView } from './viewer.js';
import { getSkillIndex } from './discovery.js';
import { runCurator, toggleCuratorPause, getCuratorStatus } from './curator.js';
import { skillScopeManager } from './scope.js';
import { setPinned } from './telemetry.js';

const SkillManageSchema = z.object({
  action: z.enum([
    'create',
    'patch',
    'edit',
    'delete',
    'write_file',
    'remove_file',
  ]).describe('Management action to perform'),
  name: z.string().describe('Skill name'),
  content: z.string().optional().describe('Full SKILL.md content (for create/edit)'),
  category: z.string().optional().describe('Category folder (for create)'),
  file_path: z.string().optional().describe('Relative path under references/templates/scripts/assets'),
  file_content: z.string().optional().describe('Content for write_file'),
  old_string: z.string().optional().describe('Text to replace (for patch)'),
  new_string: z.string().optional().describe('Replacement text (for patch)'),
  replace_all: z.boolean().optional().describe('Replace all occurrences (for patch)'),
});

export const SkillManageTool: Tool<typeof SkillManageSchema> = {
  name: 'SkillManageTool',
  description: 'Create, edit, patch, delete, or manage supporting files for skills. Use this to build and maintain reusable skill instructions.',
  schema: SkillManageSchema,
  async execute(args) {
    return skillManage({
      action: args.action,
      name: args.name,
      content: args.content,
      category: args.category,
      filePath: args.file_path,
      fileContent: args.file_content,
      oldString: args.old_string,
      newString: args.new_string,
      replaceAll: args.replace_all,
    });
  },
};

const SkillViewSchema = z.object({
  name: z.string().describe('Skill name to load'),
  file_path: z.string().optional().describe('Optional supporting file path to load instead of SKILL.md'),
});

export const SkillViewTool: Tool<typeof SkillViewSchema> = {
  name: 'SkillViewTool',
  description: 'Load a skill\'s full content or a specific supporting file. Use before invoking a skill to understand its instructions, or to read references/templates.',
  schema: SkillViewSchema,
  async execute(args) {
    return skillView({
      name: args.name,
      filePath: args.file_path,
    });
  },
};

const SkillsListSchema = z.object({
  category: z.string().optional().describe('Filter by category name'),
});

export const SkillsListTool: Tool<typeof SkillsListSchema> = {
  name: 'SkillsListTool',
  description: 'List all available skills with their descriptions. Returns a lightweight index — use SkillViewTool to load full content.',
  schema: SkillsListSchema,
  async execute(args) {
    const entries = getSkillIndex();
    let filtered = entries;
    if (args.category) {
      filtered = entries.filter((e) => e.category === args.category);
    }
    if (filtered.length === 0) {
      return args.category
        ? `No skills found in category "${args.category}".`
        : 'No skills found.';
    }
    const lines = filtered.map((e) => {
      const cat = e.category ? ` [${e.category}]` : '';
      return `  - ${e.name}${cat}: ${e.description}`;
    });
    return `Available skills (${filtered.length}):\n${lines.join('\n')}`;
  },
};

const SkillCuratorSchema = z.object({
  action: z.enum(['run', 'pause', 'resume', 'status']).describe('Curator action'),
});

export const SkillCuratorTool: Tool<typeof SkillCuratorSchema> = {
  name: 'SkillCuratorTool',
  description: 'Run or control the background skill curator. The curator periodically reviews skills for quality issues, marks unused skills as stale, and archives very old skills.',
  schema: SkillCuratorSchema,
  async execute(args) {
    switch (args.action) {
      case 'run': {
        const result = runCurator();
        return `Curator run complete. Reviewed ${result.reviewed}, transitioned ${result.transitioned} to stale, archived ${result.archived}, found ${result.issuesFound} issues. (${result.durationSeconds}s)`;
      }
      case 'pause': {
        toggleCuratorPause(true);
        return 'Curator paused.';
      }
      case 'resume': {
        toggleCuratorPause(false);
        return 'Curator resumed.';
      }
      case 'status':
        return getCuratorStatus();
    }
  },
};

const SkillPinSchema = z.object({
  name: z.string().describe('Skill name'),
  pin: z.boolean().describe('true to pin, false to unpin'),
});

export const SkillPinTool: Tool<typeof SkillPinSchema> = {
  name: 'SkillPinTool',
  description: 'Pin or unpin a skill. Pinned skills cannot be deleted, edited, or archived by the curator.',
  schema: SkillPinSchema,
  async execute(args) {
    setPinned(args.name, args.pin);
    return `${args.pin ? 'Pinned' : 'Unpinned'} skill "${args.name}".`;
  },
};
