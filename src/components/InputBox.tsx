import { Box, Text, useInput } from 'ink';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';

interface InputBoxProps {
  onSubmit: (input: string) => void;
  disabled: boolean;
  activeSkill: string | null;
  commands?: string[];
}

export function InputBox({ onSubmit, disabled, activeSkill, commands = [] }: InputBoxProps) {
  const [input, setInput] = useState('');
  const [multiline, setMultiline] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyRef = useRef<string[]>([]);

  // Keep latest refs for useInput callback to avoid stale closure issues
  const disabledRef = useRef(disabled);
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => { onSubmitRef.current = onSubmit; }, [onSubmit]);

  const suggestions = useMemo(() => {
    if (!input.startsWith('/')) return [];
    const prefix = input.slice(1);
    return commands.filter((cmd) => cmd.startsWith(prefix));
  }, [input, commands]);

  const applySuggestion = useCallback(() => {
    if (suggestions.length > 0) {
      const idx = suggestionIndex % suggestions.length;
      setInput('/' + suggestions[idx] + ' ');
      setSuggestionIndex(0);
    }
  }, [suggestions, suggestionIndex]);

  const addToHistory = useCallback((text: string) => {
    // Avoid duplicates at the end
    if (historyRef.current.length === 0 || historyRef.current[historyRef.current.length - 1] !== text) {
      historyRef.current.push(text);
      // Keep last 200 entries
      if (historyRef.current.length > 200) {
        historyRef.current = historyRef.current.slice(-200);
      }
    }
  }, []);

  useInput((inputChar, key) => {
    if (disabledRef.current) return;

    if (key.tab) {
      applySuggestion();
      return;
    }

    if (key.return) {
      if (multiline) {
        setInput((prev) => prev + '\n');
      } else {
        const trimmed = input.trim();
        if (trimmed) {
          addToHistory(trimmed);
          onSubmitRef.current(trimmed);
          setInput('');
        }
      }
      setSuggestionIndex(0);
      setHistoryIndex(-1);
      return;
    }

    if (key.ctrl && inputChar === 'j') {
      setMultiline((m) => !m);
      return;
    }

    if (key.upArrow) {
      if (suggestions.length > 0) {
        setSuggestionIndex((prev) =>
          (prev - 1 + suggestions.length) % suggestions.length
        );
        return;
      }
      // History navigation
      if (historyRef.current.length > 0) {
        const newIndex = historyIndex < 0
          ? historyRef.current.length - 1
          : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(historyRef.current[newIndex] || '');
      }
      return;
    }

    if (key.downArrow) {
      if (suggestions.length > 0) {
        setSuggestionIndex((prev) =>
          (prev + 1 + suggestions.length) % suggestions.length
        );
        return;
      }
      // History navigation
      if (historyIndex >= 0) {
        const newIndex = historyIndex + 1;
        if (newIndex >= historyRef.current.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(historyRef.current[newIndex] || '');
        }
      }
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      setSuggestionIndex(0);
      setHistoryIndex(-1);
      return;
    }

    if (inputChar && !key.ctrl && !key.meta) {
      setInput((prev) => prev + inputChar);
      setSuggestionIndex(0);
      setHistoryIndex(-1);
    }
  });

  const lines = input.split('\n');

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" paddingX={1}>
        <Box>
          <Text bold color="cyan">
            {activeSkill ? `[${activeSkill}] ` : ''}{'>'}{' '}
          </Text>
          {lines.length === 1 ? (
            <Text>{input}</Text>
          ) : (
            <Box flexDirection="column">
              {lines.map((line, i) => (
                <Text key={i}>{line || ' '}</Text>
              ))}
            </Box>
          )}
          {!disabled && <Text color="cyan">_</Text>}
        </Box>
        {multiline && (
          <Text dimColor>-- MULTILINE (Ctrl+J to toggle) --</Text>
        )}
      </Box>
      {suggestions.length > 0 && (
        <Box flexDirection="column" marginLeft={2}>
          {suggestions.slice(0, 8).map((cmd, i) => (
            <Text
              key={cmd}
              dimColor={i !== suggestionIndex % suggestions.length}
              bold={i === suggestionIndex % suggestions.length}
              color={i === suggestionIndex % suggestions.length ? 'yellow' : undefined}
            >
              {i === suggestionIndex % suggestions.length ? '> ' : '  '}/{cmd}
            </Text>
          ))}
          {suggestions.length > 8 && (
            <Text dimColor>  ... and {suggestions.length - 8} more</Text>
          )}
        </Box>
      )}
    </Box>
  );
}
