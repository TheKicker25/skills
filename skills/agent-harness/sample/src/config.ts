import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export interface AgentConfig {
  apiKey: string;
  model: string;
  systemPrompt: string;
  maxSteps: number;
  maxCost: number;
  sessionDir: string;
}

const DEFAULTS: AgentConfig = {
  apiKey: '',
  model: 'anthropic/claude-opus-4.7', // check openrouter.ai/models for current availability
  systemPrompt: 'You are a helpful assistant with access to tools.',
  maxSteps: 20,
  maxCost: 1.0,
  sessionDir: '.sessions',
};

export function loadConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  // Layer 1: defaults
  let config = { ...DEFAULTS };

  // Layer 2: config file
  const configPath = resolve('agent.config.json');
  if (existsSync(configPath)) {
    const file = JSON.parse(readFileSync(configPath, 'utf-8'));
    config = { ...config, ...file };
  }

  // Layer 3: environment variables
  if (process.env.OPENROUTER_API_KEY) config.apiKey = process.env.OPENROUTER_API_KEY;
  if (process.env.AGENT_MODEL) config.model = process.env.AGENT_MODEL;
  if (process.env.AGENT_MAX_STEPS) config.maxSteps = Number(process.env.AGENT_MAX_STEPS);
  if (process.env.AGENT_MAX_COST) config.maxCost = Number(process.env.AGENT_MAX_COST);

  // Layer 4: programmatic overrides
  config = { ...config, ...overrides };

  if (!config.apiKey) {
    throw new Error('OPENROUTER_API_KEY is required. Set it in .env, agent.config.json, or pass as override.');
  }

  return config;
}
