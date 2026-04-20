import { OpenRouter } from '@openrouter/agent';
import { stepCountIs, maxCost } from '@openrouter/agent/stop-conditions';
import type { AgentConfig } from './config.js';
import { tools, serverTools } from './tools/index.js';

export async function runAgent(
  config: AgentConfig,
  input: string | unknown[],
  options?: { onText?: (delta: string) => void },
) {
  const client = new OpenRouter({ apiKey: config.apiKey });

  const result = client.callModel({
    model: config.model,
    instructions: config.systemPrompt,
    input: input as any,
    tools: [...tools],
    stopWhen: [stepCountIs(config.maxSteps), maxCost(config.maxCost)],
    onTurnStart: async (ctx) => {
      if (options?.onText) options.onText(`[Turn ${ctx.numberOfTurns}]\n`);
    },
  });

  // Stream text to callback if provided
  if (options?.onText) {
    for await (const delta of result.getTextStream()) {
      options.onText(delta);
    }
  }

  const response = await result.getResponse();

  return {
    text: response.outputText ?? '',
    usage: response.usage,
    output: response.output,
  };
}

// Retry wrapper for transient errors (429, 5xx)
export async function runAgentWithRetry(
  config: AgentConfig,
  input: string | unknown[],
  options?: { onText?: (delta: string) => void; maxRetries?: number },
) {
  const maxRetries = options?.maxRetries ?? 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await runAgent(config, input, options);
    } catch (err: any) {
      const status = err?.status ?? err?.statusCode;
      const retryable = status === 429 || (status >= 500 && status < 600);

      if (!retryable || attempt === maxRetries) throw err;

      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error('Unreachable');
}
