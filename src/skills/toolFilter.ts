import type { ToolRegistry } from '../tools/types.js';
import type { Skill } from './types.js';

export function filterToolsForSkill(tools: ToolRegistry, skill?: Skill): ToolRegistry {
  if (!skill?.tools || skill.tools.length === 0) {
    return tools;
  }

  const filtered: ToolRegistry = {};
  for (const toolName of skill.tools) {
    const tool = tools[toolName];
    if (tool) {
      filtered[toolName] = tool;
    }
  }
  return filtered;
}
