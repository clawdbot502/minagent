import { BashTool } from './BashTool.js';
import { FileReadTool } from './FileReadTool.js';
import { FileWriteTool } from './FileWriteTool.js';
import { FileEditTool } from './FileEditTool.js';
import { GrepTool } from './GrepTool.js';
import { GlobTool } from './GlobTool.js';
import { LsTool } from './LsTool.js';
import { DeleteTool } from './DeleteTool.js';
import { WebFetchTool } from './WebFetchTool.js';
import { WebSearchTool } from './WebSearchTool.js';
import { AskUserTool } from './AskUserTool.js';
import { AgentTool } from './AgentTool.js';
import { TodoTool } from './TodoTool.js';
import { SleepTool } from './SleepTool.js';
import { ScheduleTool } from './ScheduleTool.js';
import { NotebookEditTool } from './NotebookEditTool.js';
import { LSPTool } from './LSPTool.js';
import { MCPTool } from './MCPTool.js';
import { TreeTool } from './TreeTool.js';
import { CodeExecuteTool } from './CodeExecuteTool.js';
import {
  SkillManageTool,
  SkillViewTool,
  SkillExitTool,
  SkillsListTool,
  SkillCuratorTool,
  SkillPinTool,
} from '../skills-v2/tools.js';
import type { ToolRegistry } from './types.js';

export const defaultTools: ToolRegistry = {
  [BashTool.name]: BashTool,
  [FileReadTool.name]: FileReadTool,
  [FileWriteTool.name]: FileWriteTool,
  [FileEditTool.name]: FileEditTool,
  [GrepTool.name]: GrepTool,
  [GlobTool.name]: GlobTool,
  [LsTool.name]: LsTool,
  [DeleteTool.name]: DeleteTool,
  [WebFetchTool.name]: WebFetchTool,
  [WebSearchTool.name]: WebSearchTool,
  [AskUserTool.name]: AskUserTool,
  [AgentTool.name]: AgentTool,
  [TodoTool.name]: TodoTool,
  [SleepTool.name]: SleepTool,
  [ScheduleTool.name]: ScheduleTool,
  [NotebookEditTool.name]: NotebookEditTool,
  [LSPTool.name]: LSPTool,
  [MCPTool.name]: MCPTool,
  [TreeTool.name]: TreeTool,
  [CodeExecuteTool.name]: CodeExecuteTool,
  [SkillManageTool.name]: SkillManageTool,
  [SkillViewTool.name]: SkillViewTool,
  [SkillExitTool.name]: SkillExitTool,
  [SkillsListTool.name]: SkillsListTool,
  [SkillCuratorTool.name]: SkillCuratorTool,
  [SkillPinTool.name]: SkillPinTool,
};

export const DESTRUCTIVE_TOOLS = new Set([
  'BashTool', 'FileWriteTool', 'FileEditTool', 'DeleteTool', 'CodeExecuteTool', 'AgentTool', 'NotebookEditTool', 'MCPTool', 'ScheduleTool', 'SkillManageTool',
]);

export const READONLY_TOOLS = new Set([
  'FileReadTool', 'GrepTool', 'GlobTool', 'LsTool', 'TreeTool', 'WebFetchTool', 'WebSearchTool', 'AskUserTool', 'LSPTool',
]);

export function getToolDefinitions(tools: ToolRegistry) {
  return Object.values(tools).map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {}, // Will be filled by zod-to-json-schema
    },
  }));
}

export * from './types.js';
