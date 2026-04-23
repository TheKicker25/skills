import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export interface DisplayConfig {
  toolCalls: 'compact' | 'verbose' | 'hidden';
  toolResults: 'compact' | 'verbose' | 'hidden';
  reasoning: boolean;
  inputStyle: 'styled' | 'plain';
}

export interface AgentConfig {
  apiKey: string;
  model: string;
  systemPrompt: string;
  maxSteps: number;
  maxCost: number;
  sessionDir: string;
  showBanner: boolean;
  display: DisplayConfig;
  slashCommands: boolean;
}

const DEFAULTS: AgentConfig = {
  apiKey: '',
  model: 'anthropic/claude-opus-4.7',
  systemPrompt: 'You are a helpful assistant with access to tools.',
  maxSteps: 20,
  maxCost: 1.0,
  sessionDir: '.sessions',
  showBanner: true,
  display: { toolCalls: 'compact', toolResults: 'compact', reasoning: false, inputStyle: 'styled' },
  slashCommands: true,
};

export function loadConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  let config = { ...DEFAULTS };

  const configPath = resolve('agent.config.json');
  if (existsSync(configPath)) {
    const file = JSON.parse(readFileSync(configPath, 'utf-8'));
    config = { ...config, ...file };
  }

  if (process.env.OPENROUTER_API_KEY) config.apiKey = process.env.OPENROUTER_API_KEY;
  if (process.env.AGENT_MODEL) config.model = process.env.AGENT_MODEL;
  if (process.env.AGENT_MAX_STEPS) config.maxSteps = Number(process.env.AGENT_MAX_STEPS);
  if (process.env.AGENT_MAX_COST) config.maxCost = Number(process.env.AGENT_MAX_COST);

  config = { ...config, ...overrides };
  if (!config.apiKey) throw new Error('OPENROUTER_API_KEY is required.');
  return config;
}
