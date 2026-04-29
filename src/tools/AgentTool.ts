import { z } from 'zod';
import type { Tool } from './types.js';
import { createLLMClient } from '../agent/llm.js';
import type { Message, ToolCall } from '../types.js';
import type { ToolResult } from '../types.js';
import type { ToolRegistry } from './types.js';

const SUBAGENT_BLOCKED_ALWAYS = new Set(['AgentTool']);
const SUBAGENT_DESTRUCTIVE = new Set(['BashTool', 'FileWriteTool', 'FileEditTool', 'DeleteTool', 'CodeExecuteTool', 'NotebookEditTool', 'MCPTool']);

function canSubAgentUseTool(toolName: string, permissionMode: string): boolean {
  if (SUBAGENT_BLOCKED_ALWAYS.has(toolName)) {
    return false;
  }
  if (permissionMode === 'bypassPermissions' || permissionMode === 'dontAsk') {
    return true;
  }
  return !SUBAGENT_DESTRUCTIVE.has(toolName);
}

async function executeSubAgentToolCalls(
  calls: ToolCall[],
  permissionMode: string,
  tools: ToolRegistry
): Promise<ToolResult[]> {
  const allowed: ToolCall[] = [];
  const denied = new Map<string, ToolResult>();

  for (const tc of calls) {
    if (canSubAgentUseTool(tc.name, permissionMode)) {
      allowed.push(tc);
    } else {
      denied.set(tc.id, {
        toolCallId: tc.id,
        name: tc.name,
        output: `Permission denied in sub-agent: ${tc.name} is blocked in permission mode "${permissionMode}". Run this action from the main agent so it can request explicit approval.`,
        error: true,
      });
    }
  }

  const allowedResults = allowed.length > 0
    ? await executeAllowedSubAgentCalls(allowed, tools)
    : [];
  const allowedMap = new Map(allowedResults.map((r) => [r.toolCallId, r]));

  return calls.map((tc) => denied.get(tc.id) || allowedMap.get(tc.id)!).filter(Boolean);
}

async function executeAllowedSubAgentCalls(calls: ToolCall[], tools: ToolRegistry): Promise<ToolResult[]> {
  const results: ToolResult[] = [];

  for (const tc of calls) {
    const tool = tools[tc.name];
    if (!tool) {
      results.push({
        toolCallId: tc.id,
        name: tc.name,
        output: `Error: Tool "${tc.name}" not found`,
        error: true,
      });
      continue;
    }

    try {
      const validated = tool.schema.parse(tc.arguments);
      const output = await tool.execute(validated);
      results.push({
        toolCallId: tc.id,
        name: tc.name,
        output,
        error: false,
      });
    } catch (err: any) {
      results.push({
        toolCallId: tc.id,
        name: tc.name,
        output: `Error: ${err.message}`,
        error: true,
      });
    }
  }

  return results;
}

export const AgentToolSchema = z.object({
  description: z.string().describe('Description of the task for the sub-agent'),
  instructions: z.string().describe('Detailed instructions for the sub-agent'),
  max_iterations: z.number().optional().describe('Maximum tool iterations (default: 10)'),
});

export function createSubAgentConfig(env: Record<string, string | undefined> = process.env) {
  const provider = (env.MINA_PROVIDER || 'generic').toLowerCase();
  return {
    llmProvider: provider === 'anthropic' ? 'anthropic' as const : 'generic' as const,
    apiKey: env.MINA_API_KEY || '',
    baseUrl: env.MINA_BASE_URL || undefined,
    model: env.MINA_MODEL || '',
    maxToolIterations: 10,
    sandbox: true,
    globalSkillsDir: '',
    localSkillsDir: '',
    contextWindow: parseInt(env.MINA_CONTEXT_WINDOW || '128000', 10),
    trustLocalSkills: false,
  };
}

export const AgentTool: Tool<typeof AgentToolSchema> = {
  name: 'AgentTool',
  description: 'Spawn a sub-agent to handle a specific task independently. Useful for parallel work or focused investigations. In safe permission modes, sub-agents are restricted to non-destructive tools.',
  schema: AgentToolSchema,
  async execute(args) {
    const config = createSubAgentConfig();

    if (!config.apiKey) {
      return 'Error: MINA_API_KEY not set for sub-agent';
    }
    if (!config.model) {
      return 'Error: MINA_MODEL not set for sub-agent';
    }

    config.maxToolIterations = args.max_iterations || 10;
    const llm = createLLMClient(config);
    const { defaultTools } = await import('./index.js');
    const tools = defaultTools;
    const permissionMode = process.env.MINA_PERMISSION_MODE || 'default';

    const messages: Message[] = [
      {
        role: 'user',
        content: `Task: ${args.description}\n\nInstructions:\n${args.instructions}`,
      },
    ];

    const systemPrompt = `You are a focused sub-agent working on a specific task. Be thorough but concise. Report your findings clearly.`;

    let iteration = 0;
    let finalContent = '';

    try {
      while (iteration < (args.max_iterations || 10)) {
        iteration++;

        const stream = llm.stream(messages, tools, systemPrompt);
        let assistantContent = '';
        let assistantToolCalls: ToolCall[] | undefined;

        for await (const chunk of stream) {
          if (chunk.content) assistantContent += chunk.content;
          if (chunk.toolCalls) assistantToolCalls = chunk.toolCalls;
        }

        messages.push({
          role: 'assistant',
          content: assistantContent,
          toolCalls: assistantToolCalls,
        });

        finalContent = assistantContent;

        if (!assistantToolCalls || assistantToolCalls.length === 0) {
          break;
        }

        const results = await executeSubAgentToolCalls(assistantToolCalls, permissionMode, tools);
        for (const result of results) {
          messages.push({
            role: 'tool',
            content: result.output,
            toolCallId: result.toolCallId,
          });
        }
      }

      return `[Sub-agent completed in ${iteration} iterations]\n\n${finalContent}`;
    } catch (err: any) {
      return `Sub-agent error: ${err.message}`;
    }
  },
};
