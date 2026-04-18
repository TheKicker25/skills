---
name: building-agent-harness
description: Generates a working agent harness in TypeScript using @openrouter/agent with configurable tools and production patterns. Presents an interactive checklist of server tools (web search, datetime, image gen), user-defined tools (file ops, shell, grep, glob), and harness modules (session persistence, compaction, approval flow). Use when building an agent, creating a harness, scaffolding an agent project, or building a coding assistant.
---

# Building an Agent Harness

Generates a working, minimal agent harness in TypeScript targeting OpenRouter. The harness uses `@openrouter/agent` for the inner loop (model calls, tool execution, stop conditions) and provides the outer shell: configuration, session management, tool definitions, and an entry point.

Architecture draws from three production agent systems:
- **pi-mono/coding-agent** — three-layer separation, JSONL sessions, pluggable tool operations
- **Claude Code** — tool metadata (read-only, destructive, approval), system prompt composition
- **Codex CLI** — layered config, approval flow with session caching, structured logging

## Prerequisites

- Node.js 18+
- `OPENROUTER_API_KEY` from [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys)
- For full SDK reference, see the `openrouter-typescript-sdk` skill

---

## Decision Tree

| User wants to... | Action |
|---|---|
| Build a new agent from scratch | Present checklist below → follow Generation Workflow |
| Add tools to an existing harness | Read [references/tools.md](references/tools.md), present tool checklist only |
| Add a harness module | Read [references/modules.md](references/modules.md), generate the module |
| Add an API server entry point | Read [references/server-entry-points.md](references/server-entry-points.md) |

---

## Interactive Tool Checklist

Present this as a multi-select checklist. Items marked **ON** are pre-selected defaults.

### OpenRouter Server Tools (server-side, zero implementation)

| Tool | Type string | Default | Config |
|------|------------|---------|--------|
| Web Search | `openrouter:web_search` | ON | engine, max_results, domain filtering |
| Datetime | `openrouter:datetime` | ON | timezone |
| Image Generation | `openrouter:image_generation` | OFF | model, quality, size, format |

Server tools go in the `tools` array alongside user-defined tools. No client code needed — OpenRouter executes them.

### User-Defined Tools (client-side, generated into src/tools/)

| Tool | Default | Description |
|------|---------|-------------|
| File Read | ON | Read files with offset/limit, detect images |
| File Write | ON | Write/create files, auto-create directories |
| File Edit | ON | Search-and-replace with diff validation |
| Glob/Find | ON | File discovery by glob pattern |
| Grep/Search | ON | Content search by regex |
| Directory List | ON | List directory contents |
| Shell/Bash | ON | Execute commands with timeout and output capture |
| JS REPL | OFF | Persistent Node.js environment |
| Sub-agent Spawn | OFF | Delegate tasks to child agents |
| Plan/Todo | OFF | Track multi-step task progress |
| Request User Input | OFF | Structured multiple-choice questions |
| Web Fetch | OFF | Fetch and extract text from web pages |
| View Image | OFF | Read local images as base64 |
| Custom Tool Template | ON | Empty skeleton for domain-specific tools |

### Harness Modules (architectural components)

| Module | Default | Description |
|--------|---------|-------------|
| Session Persistence | ON | JSONL append-only conversation log |
| Context Compaction | OFF | Summarize older messages when context is long |
| System Prompt Composition | OFF | Assemble instructions from static + dynamic context |
| Tool Permissions / Approval | OFF | Gate dangerous tools behind user confirmation |
| Structured Event Logging | OFF | Emit events for tool calls, API requests, errors |

---

## Generation Workflow

After getting checklist selections, follow this workflow:

```
- [ ] Generate package.json with dependencies
- [ ] Generate src/config.ts
- [ ] Generate src/tools/index.ts wiring selected tools + server tools
- [ ] Generate selected tool files in src/tools/ (see Tool Pattern below, specs in references/tools.md)
- [ ] Generate src/agent.ts (core runner)
- [ ] Generate selected harness modules (specs in references/modules.md)
- [ ] Generate src/cli.ts entry point (or src/server.ts — see references/server-entry-points.md)
- [ ] Generate .env.example with OPENROUTER_API_KEY=
- [ ] Verify: run npx tsc --noEmit to check types
```

---

## Tool Pattern

All user-defined tools follow this pattern using `@openrouter/agent/tool`. Here is one complete example — all other tools in [references/tools.md](references/tools.md) follow the same shape:

```typescript
import { tool } from '@openrouter/agent/tool';
import { z } from 'zod';
import { readFile, stat } from 'fs/promises';

export const fileReadTool = tool({
  name: 'file_read',
  description: 'Read the contents of a file at the given path',
  inputSchema: z.object({
    path: z.string().describe('Absolute path to the file'),
    offset: z.number().optional().describe('Start reading from this line (1-indexed)'),
    limit: z.number().optional().describe('Maximum number of lines to return'),
  }),
  execute: async ({ path, offset, limit }) => {
    try {
      const content = await readFile(path, 'utf-8');
      const lines = content.split('\n');

      const start = offset ? offset - 1 : 0;
      const end = limit ? start + limit : lines.length;
      const slice = lines.slice(start, end);

      return {
        content: slice.join('\n'),
        totalLines: lines.length,
        ...(end < lines.length && { truncated: true, nextOffset: end + 1 }),
      };
    } catch (err: any) {
      if (err.code === 'ENOENT') return { error: `File not found: ${path}` };
      if (err.code === 'EACCES') return { error: `Permission denied: ${path}` };
      return { error: err.message };
    }
  },
});
```

For specs of all other tools, see [references/tools.md](references/tools.md).

---

## Core Files

These files are always generated. The agent adapts them based on checklist selections.

### package.json

```json
{
  "name": "my-agent",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/cli.ts",
    "dev": "tsx watch src/cli.ts"
  },
  "dependencies": {
    "@openrouter/agent": "^0.3.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.7.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

### src/config.ts

```typescript
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
    try {
      const file = JSON.parse(readFileSync(configPath, 'utf-8'));
      config = { ...config, ...file };
    } catch (err: any) {
      throw new Error(`Failed to parse agent.config.json: ${err.message}`);
    }
  }

  // Layer 3: environment variables
  if (process.env.OPENROUTER_API_KEY) config.apiKey = process.env.OPENROUTER_API_KEY;
  if (process.env.AGENT_MODEL) config.model = process.env.AGENT_MODEL;
  if (process.env.AGENT_MAX_STEPS) {
    const n = Number(process.env.AGENT_MAX_STEPS);
    if (Number.isFinite(n) && n > 0) config.maxSteps = n;
  }
  if (process.env.AGENT_MAX_COST) {
    const n = Number(process.env.AGENT_MAX_COST);
    if (Number.isFinite(n) && n > 0) config.maxCost = n;
  }

  // Layer 4: programmatic overrides
  config = { ...config, ...overrides };

  if (!config.apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY is required. Set it as an environment variable, in agent.config.json, or pass as override.',
    );
  }

  return config;
}
```

### src/tools/index.ts

Adapt imports based on checklist selections. This example includes all default-ON tools:

```typescript
import { fileReadTool } from './file-read.js';
import { fileWriteTool } from './file-write.js';
import { fileEditTool } from './file-edit.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { listDirTool } from './list-dir.js';
import { shellTool } from './shell.js';

// User-defined tools executed client-side
export const tools = [
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  globTool,
  grepTool,
  listDirTool,
  shellTool,
];

// OpenRouter server tools — executed server-side, no implementation needed.
// Pass these alongside user-defined tools in the callModel request.
// Note: server tool objects have a different shape from user-defined tools,
// so they are kept separate and spread into the tools array at call time.
export const serverTools: Array<{ type: string }> = [
  { type: 'openrouter:web_search' },
  { type: 'openrouter:datetime' },
];
```

### src/agent.ts

```typescript
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
    input,
    tools: [...tools, ...serverTools] as any,
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
```

### src/cli.ts

```typescript
import { createInterface } from 'readline';
import { loadConfig } from './config.js';
import { runAgentWithRetry } from './agent.js';

async function main() {
  const config = loadConfig();

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = () => new Promise<string>((resolve) => rl.question('> ', resolve));

  console.log(`Agent ready (model: ${config.model}). Type "exit" to quit.\n`);

  while (true) {
    const input = await prompt();
    if (input.trim().toLowerCase() === 'exit') break;
    if (!input.trim()) continue;

    try {
      const result = await runAgentWithRetry(config, input, {
        onText: (delta) => process.stdout.write(delta),
      });

      console.log('\n');

      const { usage } = result;
      if (usage) {
        console.log(
          `[tokens: ${usage.inputTokens ?? 0} in / ${usage.outputTokens ?? 0} out]\n`,
        );
      }
    } catch (err: any) {
      console.error(`\nError: ${err.message}\n`);
    }
  }

  rl.close();
}

main();
```

---

## Reference Files

For content beyond the core files:

- **[references/tools.md](references/tools.md)** — Specs for all user-defined tools: file-read, file-write, file-edit, glob, grep, list-dir, shell, js-repl, sub-agent, plan, request-input, web-fetch, view-image, custom template
- **[references/modules.md](references/modules.md)** — Harness modules: session persistence, context compaction, system prompt composition, tool approval, structured logging
- **[references/server-entry-points.md](references/server-entry-points.md)** — Express/Hono API server entry point with SSE streaming, plus extension points (MCP, WebSocket, dynamic models)
