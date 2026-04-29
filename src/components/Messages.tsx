import { Box, Text } from 'ink';
import type { Message, ToolCall, ToolResult } from '../types.js';
import { ToolCallDisplay } from './ToolCall.js';
import { MarkdownText } from './MarkdownText.js';
import { getToolResultsKey } from '../utils/toolResults.js';

interface MessagesProps {
  messages: Message[];
  toolResults: Map<string, ToolResult[]>;
}

export function Messages({ messages, toolResults }: MessagesProps) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {messages.map((msg, idx) => {
        if (msg.role === 'user') {
          return (
            <Box key={idx} marginY={1}>
              <Text bold color="blue">You: </Text>
              <Text>{msg.content}</Text>
            </Box>
          );
        }

        if (msg.role === 'assistant') {
          const toolResultsKey = getToolResultsKey(msg.toolCalls);

          return (
            <Box key={idx} flexDirection="column" marginY={1}>
              <Text bold color="magenta">Agent: </Text>
              {msg.content && <MarkdownText content={msg.content} />}
              {msg.toolCalls && (
                <ToolCallDisplay
                  calls={msg.toolCalls}
                  results={toolResultsKey ? toolResults.get(toolResultsKey) : undefined}
                />
              )}
            </Box>
          );
        }

        if (msg.role === 'system') {
          return (
            <Box key={idx} marginY={1}>
              <Text dimColor italic>[{msg.content}]</Text>
            </Box>
          );
        }

        return null;
      })}
    </Box>
  );
}
