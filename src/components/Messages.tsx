import { Box, Text, useWindowSize } from 'ink';
import { useMemo } from 'react';
import type { Message, ToolCall, ToolResult } from '../types.js';
import { ToolCallDisplay } from './ToolCall.js';
import { MarkdownText } from './MarkdownText.js';
import { getToolResultsKey } from '../utils/toolResults.js';

interface MessagesProps {
  messages: Message[];
  toolResults: Map<string, ToolResult[]>;
}

// Estimate lines per message to cap rendering and prevent overflow
const MAX_VISIBLE_MESSAGES = 150;
const LINES_PER_MESSAGE_ESTIMATE = 3;

export function Messages({ messages, toolResults }: MessagesProps) {
  const { rows: height } = useWindowSize();

  const visibleMessages = useMemo(() => {
    // Calculate how many messages can reasonably fit in the terminal
    // Reserve 4 lines for header + input box + margins
    const availableHeight = Math.max(height - 4, 10);
    const maxByHeight = Math.floor(availableHeight / LINES_PER_MESSAGE_ESTIMATE);
    const maxMessages = Math.min(MAX_VISIBLE_MESSAGES, Math.max(maxByHeight, 20));

    const filtered = messages.filter(
      (msg) => msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system'
    );
    return filtered.slice(-maxMessages);
  }, [messages, height]);

  return (
    <Box flexDirection="column" overflow="hidden">
      {visibleMessages.map((msg, idx) => {
        if (msg.role === 'user') {
          return (
            <Box key={idx} marginY={1} flexShrink={0}>
              <Text bold color="blue">You: </Text>
              <Text>{msg.content}</Text>
            </Box>
          );
        }

        if (msg.role === 'assistant') {
          const toolResultsKey = getToolResultsKey(msg.toolCalls);

          return (
            <Box key={idx} flexDirection="column" marginY={1} flexShrink={0}>
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

        // msg.role === 'system'
        return (
          <Box key={idx} marginY={1} flexShrink={0}>
            <Text dimColor italic>[{msg.content}]</Text>
          </Box>
        );
      })}
    </Box>
  );
}
