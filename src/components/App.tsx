import { Box, Text, useApp, useInput } from 'ink';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Message, ToolCall, ToolResult } from '../types.js';
import type { Config } from '../config.js';
import type { ToolRegistry } from '../tools/types.js';
import type { SkillRegistry } from '../skills/registry.js';
import { Agent } from '../agent/index.js';
import { Messages } from './Messages.js';
import { InputBox } from './InputBox.js';
import { ContextManager } from '../utils/context.js';
import { CostTracker } from '../utils/costTracker.js';
import { createCommandRegistry, executeCommand } from '../commands/registry.js';
import { loadSessionState, saveSessionState } from '../state/session.js';
import { parseApprovalInput, shouldIgnoreSubmit } from '../utils/approvalInput.js';

interface AppProps {
  config: Config;
  tools: ToolRegistry;
  skills: SkillRegistry;
}

export function App({ config, tools, skills }: AppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentStream, setCurrentStream] = useState('');
  const [currentReasoning, setCurrentReasoning] = useState('');
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingPermission, setPendingPermission] = useState<{ toolName: string; args: Record<string, unknown>; resolve: (v: boolean) => void } | null>(null);
  const [pendingPlan, setPendingPlan] = useState<{ calls: ToolCall[]; resolve: (v: boolean) => void } | null>(null);
  const [pendingUserQuestion, setPendingUserQuestion] = useState<{ question: string; options?: string[]; resolve: (v: string) => void } | null>(null);
  const [contextFiles, setContextFiles] = useState<string[]>([]);
  const toolResultsRef = useRef(new Map<string, ToolResult[]>());
  const contextManagerRef = useRef(new ContextManager());
  const costTrackerRef = useRef(new CostTracker(config.model));
  const agentRef = useRef(new Agent(config, tools, skills, contextManagerRef.current, costTrackerRef.current));
  const commandRegistry = useRef(createCommandRegistry()).current;
  const commandNames = useMemo(() => Array.from(commandRegistry.keys()), [commandRegistry]);
  const scrollRef = useRef(0);

  // Load previous session
  useEffect(() => {
    const state = loadSessionState();
    if (state?.messages && state.messages.length > 0) {
      setMessages(state.messages);
      agentRef.current.setMessages(state.messages);
    }
  }, []);

  // Save session on exit
  useEffect(() => {
    const handler = () => {
      saveSessionState(agentRef.current.getMessages());
    };
    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);
    return () => {
      process.off('SIGINT', handler);
      process.off('SIGTERM', handler);
    };
  }, []);

  useEffect(() => {
    agentRef.current.setActiveSkill(activeSkill);
  }, [activeSkill]);

  const syncFromAgent = useCallback((extraMessage?: Message) => {
    const nextMessages = agentRef.current.getMessages();
    setMessages(extraMessage ? [...nextMessages, extraMessage] : [...nextMessages]);
    setContextFiles(agentRef.current.getContextFilePaths());
  }, []);

  const handlePermission = useCallback(async (toolName: string, args: Record<string, unknown>): Promise<boolean> => {
    return new Promise((resolve) => {
      setPendingPermission({ toolName, args, resolve });
    });
  }, []);

  const handlePlan = useCallback(async (calls: ToolCall[]): Promise<boolean> => {
    return new Promise((resolve) => {
      setPendingPlan({ calls, resolve });
    });
  }, []);

  const handleUserQuestion = useCallback(async (question: string, options?: string[]): Promise<string> => {
    return new Promise((resolve) => {
      setPendingUserQuestion({ question, options, resolve });
    });
  }, []);

  const handleSubmit = useCallback(
    async (input: string) => {
      const hasPendingApproval = Boolean(pendingPermission || pendingPlan || pendingUserQuestion);
      if (shouldIgnoreSubmit({ isProcessing, hasPendingApproval })) return;

      // Handle permission response
      if (pendingPermission) {
        const decision = parseApprovalInput(input);
        if (decision === null) {
          setError('Permission prompt expects y/yes or n/no.');
          return;
        }
        setError(null);
        pendingPermission.resolve(decision);
        setPendingPermission(null);
        return;
      }

      if (pendingPlan) {
        const decision = parseApprovalInput(input);
        if (decision === null) {
          setError('Plan prompt expects y/yes or n/no.');
          return;
        }
        setError(null);
        pendingPlan.resolve(decision);
        setPendingPlan(null);
        return;
      }

      if (pendingUserQuestion) {
        setError(null);
        pendingUserQuestion.resolve(input);
        setPendingUserQuestion(null);
        return;
      }

      // Handle built-in commands
      if (input === '/quit' || input === '/exit') {
        saveSessionState(agentRef.current.getMessages());
        exit();
        return;
      }

      if (input.startsWith('/')) {
        const ctx = {
          agent: agentRef.current,
          tools,
          skills,
          cwd: process.cwd(),
        };
        const result = await executeCommand(input, commandRegistry, ctx);
        if (result !== null) {
          const systemMsg: Message = { role: 'assistant', content: result };
          syncFromAgent(systemMsg);
          return;
        }

        // Check for skill switch
        const skillName = input.slice(1).trim();
        if (skills.has(skillName)) {
          setActiveSkill(skillName);
          const systemMsg: Message = {
            role: 'assistant',
            content: `Switched to skill: ${skillName}`,
          };
          syncFromAgent(systemMsg);
          return;
        }
      }

      setError(null);
      setIsProcessing(true);
      setCurrentStream('');
      setCurrentReasoning('');

      const userMsg: Message = { role: 'user', content: input };
      setMessages((prev) => [...prev, userMsg]);

      let streamingMsg: Message = { role: 'assistant', content: '' };

      await agentRef.current.sendMessage(input, {
        onStreamChunk: (text) => {
          setCurrentStream((prev) => prev + text);
          streamingMsg.content += text;
        },
        onReasoning: (text) => {
          setCurrentReasoning((prev) => prev + text);
        },
        onToolCalls: (calls) => {
          streamingMsg.toolCalls = calls;
        },
        onToolResults: (results) => {
          if (streamingMsg.toolCalls) {
            const callId = streamingMsg.toolCalls.map((c) => c.id).join(',');
            toolResultsRef.current.set(callId, results);
          }
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { ...streamingMsg }];
            }
            return [...prev, { ...streamingMsg }];
          });
        },
        onPermissionRequest: handlePermission,
        onPlanRequest: handlePlan,
        onUserQuestion: handleUserQuestion,
        onComplete: () => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { ...streamingMsg }];
            }
            return [...prev, { ...streamingMsg }];
          });
          setCurrentStream('');
          setCurrentReasoning('');
        },
        onCompaction: (summary) => {
          const compactMsg: Message = { role: 'system', content: summary };
          setMessages((prev) => [...prev, compactMsg]);
        },
        onError: (err) => {
          setError(err);
          setIsProcessing(false);
        },
      });

      setIsProcessing(false);
    },
    [isProcessing, pendingPermission, pendingPlan, pendingUserQuestion, skills, tools, commandRegistry, exit, handlePermission, handlePlan, handleUserQuestion, syncFromAgent]
  );

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box paddingY={1}>
        <Text dimColor>
          MinAgent | {config.model} | {contextFiles.length > 0 ? `${contextFiles.length} ctx files | ` : ''}
          {activeSkill ? `[${activeSkill}]` : 'default mode'}
        </Text>
      </Box>

      {error && (
        <Box marginY={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* Permission prompt */}
      {pendingPermission && (
        <Box marginY={1} borderStyle="single" borderColor="yellow" paddingX={1}>
          <Text color="yellow">
            Allow {pendingPermission.toolName}(
            {JSON.stringify(pendingPermission.args).slice(0, 100)}
            )? (y/n)
          </Text>
        </Box>
      )}

      {/* Plan prompt */}
      {pendingPlan && (
        <Box marginY={1} borderStyle="single" borderColor="blue" paddingX={1} flexDirection="column">
          <Text bold color="blue">Plan mode — execute the following tools?</Text>
          {pendingPlan.calls.map((call) => (
            <Text key={call.id} dimColor>
              {'  '}- {call.name}: {JSON.stringify(call.arguments).slice(0, 100)}
            </Text>
          ))}
          <Text color="blue">Approve all? (y/n)</Text>
        </Box>
      )}

      {pendingUserQuestion && (
        <Box marginY={1} borderStyle="single" borderColor="cyan" paddingX={1} flexDirection="column">
          <Text bold color="cyan">Agent needs input</Text>
          <Text>{pendingUserQuestion.question}</Text>
          {pendingUserQuestion.options && pendingUserQuestion.options.length > 0 && (
            <Text dimColor>Options: {pendingUserQuestion.options.join(', ')}</Text>
          )}
        </Box>
      )}

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <Messages messages={messages} toolResults={toolResultsRef.current} />
        {isProcessing && !pendingPermission && !pendingPlan && !pendingUserQuestion && (
          <Box flexDirection="column" marginY={1}>
            {currentReasoning && (
              <Box marginBottom={1}>
                <Text dimColor italic>Thinking... {currentReasoning.slice(-120)}</Text>
              </Box>
            )}
            {currentStream && (
              <Text color="magenta">Agent: {currentStream}</Text>
            )}
          </Box>
        )}
      </Box>

      {/* Input */}
      <InputBox
        onSubmit={handleSubmit}
        disabled={isProcessing && !pendingPermission && !pendingPlan && !pendingUserQuestion}
        activeSkill={activeSkill}
        commands={commandNames}
      />
    </Box>
  );
}
