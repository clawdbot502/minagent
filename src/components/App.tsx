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
import { saveSessionState, archiveSessionState } from '../state/session.js';
import { parseApprovalInput, shouldIgnoreSubmit } from '../utils/approvalInput.js';
import { findSkillDir } from '../skills-v2/discovery.js';
import { buildSkillInvocationMessage } from '../skills-v2/prompt.js';
import { skillView } from '../skills-v2/viewer.js';
import { skillScopeManager } from '../skills-v2/scope.js';

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
  const [v2ActiveSkills, setV2ActiveSkills] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pendingPermissionRef = useRef<{ resolve: (v: boolean) => void } | null>(null);
  const pendingPlanRef = useRef<{ resolve: (v: boolean) => void } | null>(null);
  const pendingUserQuestionRef = useRef<{ resolve: (v: string) => void } | null>(null);

  const [pendingPermission, setPendingPermission] = useState<{ toolName: string; args: Record<string, unknown> } | null>(null);
  const [pendingPlan, setPendingPlan] = useState<{ calls: ToolCall[] } | null>(null);
  const [pendingUserQuestion, setPendingUserQuestion] = useState<{ question: string; options?: string[] } | null>(null);
  const [contextFiles, setContextFiles] = useState<string[]>([]);
  const toolResultsRef = useRef(new Map<string, ToolResult[]>());
  const contextManagerRef = useRef(new ContextManager());
  const costTrackerRef = useRef(new CostTracker(config.model));
  const agentRef = useRef(new Agent(config, tools, skills, contextManagerRef.current, costTrackerRef.current));
  const commandRegistry = useRef(createCommandRegistry()).current;
  const commandNames = useMemo(() => Array.from(commandRegistry.keys()), [commandRegistry]);

  // Save session on unexpected exit (SIGINT) so /resume can recover it
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
    setActiveSkill(agentRef.current.getActiveSkill());
    setV2ActiveSkills(skillScopeManager.getActiveSkillNames());
  }, []);

  const handlePermission = useCallback(async (toolName: string, args: Record<string, unknown>): Promise<boolean> => {
    return new Promise((resolve) => {
      pendingPermissionRef.current = { resolve };
      setPendingPermission({ toolName, args });
    });
  }, []);

  const handlePlan = useCallback(async (calls: ToolCall[]): Promise<boolean> => {
    return new Promise((resolve) => {
      pendingPlanRef.current = { resolve };
      setPendingPlan({ calls });
    });
  }, []);

  const handleUserQuestion = useCallback(async (question: string, options?: string[]): Promise<string> => {
    return new Promise((resolve) => {
      pendingUserQuestionRef.current = { resolve };
      setPendingUserQuestion({ question, options });
    });
  }, []);

  const handleSubmit = useCallback(
    async (input: string) => {
      const hasPendingApproval = Boolean(pendingPermission || pendingPlan || pendingUserQuestion);
      if (shouldIgnoreSubmit({ isProcessing, hasPendingApproval })) return;

      // Handle permission response
      if (pendingPermissionRef.current) {
        const decision = parseApprovalInput(input);
        if (decision === null) {
          setError('Permission prompt expects y/yes or n/no.');
          return;
        }
        setError(null);
        pendingPermissionRef.current.resolve(decision);
        pendingPermissionRef.current = null;
        setPendingPermission(null);
        return;
      }

      if (pendingPlanRef.current) {
        const decision = parseApprovalInput(input);
        if (decision === null) {
          setError('Plan prompt expects y/yes or n/no.');
          return;
        }
        setError(null);
        pendingPlanRef.current.resolve(decision);
        pendingPlanRef.current = null;
        setPendingPlan(null);
        return;
      }

      if (pendingUserQuestionRef.current) {
        setError(null);
        pendingUserQuestionRef.current.resolve(input);
        pendingUserQuestionRef.current = null;
        setPendingUserQuestion(null);
        return;
      }

      // Handle built-in commands
      if (input === '/quit' || input === '/exit') {
        saveSessionState(agentRef.current.getMessages());
        archiveSessionState();
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

        // Check for v1 skill switch
        const afterSlash = input.slice(1).trim();
        const spaceIdx = afterSlash.indexOf(' ');
        const skillName = spaceIdx > 0 ? afterSlash.slice(0, spaceIdx) : afterSlash;
        const userInstruction = spaceIdx > 0 ? afterSlash.slice(spaceIdx + 1).trim() : '';

        if (skills.has(skillName)) {
          agentRef.current.setActiveSkill(skillName);
          setActiveSkill(skillName);
          const systemMsg: Message = {
            role: 'assistant',
            content: `Switched to skill: ${skillName}`,
          };
          syncFromAgent(systemMsg);
          return;
        }

        // Check for v2 skill invocation
        const v2SkillDir = findSkillDir(skillName);
        if (v2SkillDir) {
          const viewResult = await skillView({ name: skillName });
          try {
            const parsed = JSON.parse(viewResult);
            if (parsed.success) {
              if (!skillScopeManager.isActive(skillName)) {
                skillScopeManager.enter(skillName, 'turn');
              }
              const invocationMsg = buildSkillInvocationMessage(
                skillName,
                parsed.content,
                parsed.skillDir,
                parsed.linkedFiles || [],
                userInstruction || 'User invoked this skill via slash command.'
              );
              setIsProcessing(true);
              setCurrentStream('');
              setCurrentReasoning('');

              const userMsg: Message = { role: 'user', content: input };
              setMessages((prev) => [...prev, userMsg]);

              let streamingMsg: Message = { role: 'assistant', content: '' };

              await agentRef.current.sendMessage(invocationMsg, {
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
              return;
            }
          } catch {
            // Not a valid skill view result, fall through
          }
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
          {activeSkill ? `[${activeSkill}]` : v2ActiveSkills.length > 0 ? `[${v2ActiveSkills.join(', ')}]` : 'default mode'}
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
