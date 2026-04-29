import { homedir } from 'os';
import { join } from 'path';

export type LLMProvider = 'openai' | 'anthropic' | 'generic';

export interface Config {
  llmProvider: LLMProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  globalSkillsDir: string;
  localSkillsDir: string;
  maxToolIterations: number;
  sandbox: boolean;
  contextWindow: number;
  trustLocalSkills: boolean;
}

function getEnv(key: string): string | undefined {
  return process.env[key];
}

/**
 * Load configuration from environment variables.
 * NO default models are provided — the user must explicitly configure
 * MINA_API_KEY and MINA_MODEL. This ensures compatibility with ANY
 * OpenAI-compatible or native API endpoint.
 */
export function loadConfig(): Config {
  const apiKey = getEnv('MINA_API_KEY') || '';
  const model = getEnv('MINA_MODEL') || '';
  const baseUrl = getEnv('MINA_BASE_URL') || undefined;

  // Provider hint: used only for message format selection.
  // 'generic' means "OpenAI-compatible API" and works with
  // local models (Ollama, vLLM), Gemini, Azure, DeepSeek, etc.
  const providerRaw = (getEnv('MINA_PROVIDER') || 'generic').toLowerCase();
  const provider: LLMProvider =
    providerRaw === 'anthropic' ? 'anthropic' :
    providerRaw === 'openai' ? 'openai' : 'generic';

  // Context window can be overridden per-model via env
  const contextWindowRaw = getEnv('MINA_CONTEXT_WINDOW');
  const contextWindow = contextWindowRaw ? parseInt(contextWindowRaw, 10) : 128_000;

  return {
    llmProvider: provider,
    apiKey,
    baseUrl,
    model,
    globalSkillsDir: join(homedir(), '.minagent', 'skills'),
    localSkillsDir: join(process.cwd(), 'skills'),
    maxToolIterations: 25,
    sandbox: getEnv('MINA_SANDBOX') !== 'false',
    contextWindow,
    trustLocalSkills: getEnv('MINA_TRUST_LOCAL_SKILLS') === 'true',
  };
}

export function validateConfig(config: Config): void {
  const errors: string[] = [];

  if (!config.apiKey) {
    errors.push('Missing API key. Set MINA_API_KEY environment variable.');
  }

  if (!config.model) {
    errors.push('Missing model name. Set MINA_MODEL environment variable (e.g., gpt-4o, claude-sonnet-4-6, llama3.1:8b, etc.).');
  }

  if (errors.length > 0) {
    throw new Error(
      errors.join('\n') +
      '\n\nExample configuration:' +
      '\n  export MINA_PROVIDER="generic"  # openai | anthropic | generic' +
      '\n  export MINA_API_KEY="..."' +
      '\n  export MINA_MODEL="..."' +
      '\n  export MINA_BASE_URL="..."' +
      '\n  export MINA_CONTEXT_WINDOW=128000  (optional)'
    );
  }
}
