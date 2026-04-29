import { describe, expect, test } from 'bun:test';
import { FileReadToolSchema } from '../tools/FileReadTool.js';
import { messagesToAnthropicMessages, toolSchemaToJsonSchema } from './llm.js';

describe('toolSchemaToJsonSchema', () => {
  test('preserves zod object properties and required fields', () => {
    const schema = toolSchemaToJsonSchema(FileReadToolSchema);

    expect(schema.type).toBe('object');
    expect(schema.properties).toHaveProperty('file_path');
    expect(schema.required).toContain('file_path');
  });
});

describe('messagesToAnthropicMessages', () => {
  test('omits empty text blocks for assistant tool-use messages', () => {
    const messages = messagesToAnthropicMessages([
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call-1',
            name: 'FileReadTool',
            arguments: { file_path: '/tmp/example.txt' },
          },
        ],
      },
    ]);

    expect(messages[0]?.content).toEqual([
      {
        type: 'tool_use',
        id: 'call-1',
        name: 'FileReadTool',
        input: { file_path: '/tmp/example.txt' },
      },
    ]);
  });
});
