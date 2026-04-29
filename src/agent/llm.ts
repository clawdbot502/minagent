import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { Config, LLMProvider } from '../config.js';
import type { Message, ToolCall } from '../types.js';
import type { ToolRegistry } from '../tools/types.js';

export interface LLMResponse {
  content: string;
  toolCalls: ToolCall[];
}

export interface LLMStreamChunk {
  content: string;
  toolCalls?: ToolCall[];
  reasoning?: string;
  done: boolean;
}

export interface LLMClient {
  stream(
    messages: Message[],
    tools: ToolRegistry,
    systemPrompt?: string
  ): AsyncGenerator<LLMStreamChunk>;
}

export function toolSchemaToJsonSchema(schema: z.ZodType): Record<string, any> {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, any>;
  return jsonSchema;
}

export function messagesToAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
  const anthropicMessages: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'tool') {
      anthropicMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.toolCallId || '',
            content: msg.content,
          },
        ],
      });
    } else if (msg.role === 'assistant' && msg.toolCalls) {
      anthropicMessages.push({
        role: 'assistant',
        content: [
          ...(msg.content ? [{ type: 'text' as const, text: msg.content }] : []),
          ...msg.toolCalls.map((tc) => ({
            type: 'tool_use' as const,
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          })),
        ],
      });
    } else if (msg.role === 'user') {
      anthropicMessages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      anthropicMessages.push({ role: 'assistant', content: msg.content });
    }
  }

  return anthropicMessages;
}

/**
 * Create an LLM client based on the configured provider.
 *
 * - 'generic'  → OpenAI-compatible API (works with OpenAI, Gemini, Azure,
 *                DeepSeek, local Ollama/vLLM, and any other provider that
 *                exposes an OpenAI-compatible /chat/completions endpoint)
 * - 'openai'   → Same as generic but explicitly tagged
 * - 'anthropic'→ Native Anthropic Messages API
 */
export function createLLMClient(config: Config): LLMClient {
  if (config.llmProvider === 'anthropic') {
    return new AnthropicClient(config);
  }
  return new GenericClient(config);
}

// ---------------------------------------------------------------------------
// Generic OpenAI-compatible client
// ---------------------------------------------------------------------------

class GenericClient implements LLMClient {
  private client: OpenAI;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  private buildTools(tools: ToolRegistry): OpenAI.Chat.ChatCompletionTool[] {
    return Object.values(tools).map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: toolSchemaToJsonSchema(tool.schema),
      },
    }));
  }

  async *stream(
    messages: Message[],
    tools: ToolRegistry,
    systemPrompt?: string
  ): AsyncGenerator<LLMStreamChunk> {
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      openaiMessages.push({ role: 'system', content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === 'tool') {
        openaiMessages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId || '',
          content: msg.content,
        });
      } else if (msg.role === 'assistant' && msg.toolCalls) {
        openaiMessages.push({
          role: 'assistant',
          content: msg.content,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        });
      } else if (msg.role === 'user' || msg.role === 'assistant') {
        openaiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const toolDefs = this.buildTools(tools);
    const reasoningEnabled = process.env.MINA_REASONING === 'true';

    const reqBody: OpenAI.Chat.ChatCompletionCreateParams = {
      model: this.config.model,
      messages: openaiMessages,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      stream: true,
    };

    // Only inject reasoning parameters if the user explicitly enabled them.
    // We do NOT check model names here — if the endpoint supports reasoning
    // parameters it will use them; if not, the endpoint will ignore them.
    if (reasoningEnabled) {
      (reqBody as any).reasoning_effort = 'medium';
    }

    const stream = await this.client.chat.completions.create(reqBody);

    let content = '';
    const toolCallBuffers = new Map<number, { id: string; name: string; args: string }>();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        content += delta.content;
        yield { content: delta.content, done: false };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const index = tc.index;
          if (!toolCallBuffers.has(index)) {
            toolCallBuffers.set(index, {
              id: tc.id || '',
              name: tc.function?.name || '',
              args: tc.function?.arguments || '',
            });
          } else {
            const buf = toolCallBuffers.get(index)!;
            if (tc.id) buf.id = tc.id;
            if (tc.function?.name) buf.name = tc.function.name;
            if (tc.function?.arguments) buf.args += tc.function.arguments;
          }
        }
      }
    }

    const toolCalls: ToolCall[] = [];
    for (const [, buf] of toolCallBuffers) {
      try {
        toolCalls.push({
          id: buf.id,
          name: buf.name,
          arguments: JSON.parse(buf.args || '{}'),
        });
      } catch {
        toolCalls.push({ id: buf.id, name: buf.name, arguments: {} });
      }
    }

    yield { content: '', toolCalls: toolCalls.length > 0 ? toolCalls : undefined, done: true };
  }
}

// ---------------------------------------------------------------------------
// Native Anthropic client
// ---------------------------------------------------------------------------

class AnthropicClient implements LLMClient {
  private client: Anthropic;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  private buildTools(tools: ToolRegistry): Anthropic.Tool[] {
    return Object.values(tools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: toolSchemaToJsonSchema(tool.schema) as Anthropic.Tool.InputSchema,
    }));
  }

  async *stream(
    messages: Message[],
    tools: ToolRegistry,
    systemPrompt?: string
  ): AsyncGenerator<LLMStreamChunk> {
    const anthropicMessages = messagesToAnthropicMessages(messages);

    const toolDefs = this.buildTools(tools);
    const thinkingEnabled = process.env.MINA_REASONING === 'true';

    const stream = this.client.messages.stream({
      model: this.config.model,
      max_tokens: thinkingEnabled ? 8192 : 4096,
      system: systemPrompt,
      messages: anthropicMessages,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      thinking: thinkingEnabled ? { type: 'enabled', budget_tokens: 4096 } : undefined,
    });

    let content = '';
    let thinkingContent = '';
    const toolCalls: ToolCall[] = [];

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          content += event.delta.text;
          yield { content: event.delta.text, done: false };
        } else if (event.delta.type === 'thinking_delta') {
          thinkingContent += event.delta.thinking;
          yield { reasoning: event.delta.thinking, content: '', done: false };
        }
      }
    }

    const finalMessage = await stream.finalMessage();
    for (const block of finalMessage.content) {
      if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    yield { content: '', toolCalls: toolCalls.length > 0 ? toolCalls : undefined, done: true };
  }
}
