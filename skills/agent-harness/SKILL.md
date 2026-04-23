---
name: agent-harness
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
| ASCII Logo Banner | OFF | Custom ASCII art banner on startup — ask for project name |
| Context Compaction | OFF | Summarize older messages when context is long |
| System Prompt Composition | OFF | Assemble instructions from static + dynamic context |
| Tool Permissions / Approval | OFF | Gate dangerous tools behind user confirmation |
| Structured Event Logging | OFF | Emit events for tool calls, API requests, errors |
| `@`-file References | OFF | `@filename` to attach file content to next message |
| `!` Shell Shortcut | OFF | `!command` to run shell and inject output into context |
| Multi-line Input | OFF | Shift+Enter for multi-line (requires raw terminal mode) |

### Slash Commands (user-facing REPL commands)

| Command | Default | Description |
|---------|---------|-------------|
| `/model` | ON | Switch model via OpenRouter API |
| `/new` | ON | Start a fresh conversation |
| `/help` | ON | List available commands |
| `/compact` | OFF | Manually trigger context compaction |
| `/session` | OFF | Show session metadata and token usage |
| `/export` | OFF | Save conversation as Markdown |

When slash commands are enabled, generate `src/commands.ts` with a command registry. See [references/slash-commands.md](references/slash-commands.md) for specs.

---

## Generation Workflow

After getting checklist selections, follow this workflow:

```
- [ ] Generate package.json with dependencies
- [ ] Generate src/config.ts (add showBanner field if ASCII Logo Banner is ON)
- [ ] Generate src/tools/index.ts wiring selected tools + server tools
- [ ] Generate selected tool files in src/tools/ (see Tool Pattern below, specs in references/tools.md)
- [ ] Generate src/agent.ts (core runner)
- [ ] Generate selected harness modules (specs in references/modules.md)
- [ ] Generate src/renderer.ts (TUI display — see references/tui.md)
- [ ] If slash commands selected: generate src/commands.ts (see references/slash-commands.md)
- [ ] If ASCII Logo Banner is ON: generate src/banner.ts (see ASCII Logo Banner section below)
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

Initialize the project and install dependencies at their latest versions:

```bash
npm init -y
npm pkg set type=module
npm pkg set scripts.start="tsx src/cli.ts"
npm pkg set scripts.dev="tsx watch src/cli.ts"
npm install @openrouter/agent glob zod
npm install -D tsx typescript @types/node
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
  showBanner: false,
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
```

### src/tools/index.ts

Adapt imports based on checklist selections. This example includes all default-ON tools:

```typescript
import { serverTool } from '@openrouter/agent';
import { fileReadTool } from './file-read.js';
import { fileWriteTool } from './file-write.js';
import { fileEditTool } from './file-edit.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { listDirTool } from './list-dir.js';
import { shellTool } from './shell.js';

export const tools = [
  // User-defined tools — executed client-side
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  globTool,
  grepTool,
  listDirTool,
  shellTool,

  // Server tools — executed by OpenRouter, no client implementation needed
  serverTool({ type: 'openrouter:web_search' }),
  serverTool({ type: 'openrouter:datetime', parameters: { timezone: 'UTC' } }),
];
```

### src/agent.ts

```typescript
import { OpenRouter } from '@openrouter/agent';
import type { Item } from '@openrouter/agent';
import { stepCountIs, maxCost } from '@openrouter/agent/stop-conditions';
import type { AgentConfig } from './config.js';
import { tools } from './tools/index.js';

export type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string };

export type AgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; name: string; callId: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; callId: string; output: string }
  | { type: 'reasoning'; delta: string };

export async function runAgent(
  config: AgentConfig,
  input: string | ChatMessage[],
  options?: { onEvent?: (event: AgentEvent) => void },
) {
  const client = new OpenRouter({ apiKey: config.apiKey });

  const result = client.callModel({
    model: config.model,
    instructions: config.systemPrompt,
    input: input as string | Item[],
    tools,
    stopWhen: [stepCountIs(config.maxSteps), maxCost(config.maxCost)],
  });

  if (options?.onEvent) {
    let lastTextLen = 0;
    const callNames = new Map<string, string>();

    for await (const item of result.getItemsStream()) {
      if (item.type === 'message') {
        const text = item.content
          ?.filter((c): c is { type: 'output_text'; text: string } => 'text' in c)
          .map((c) => c.text)
          .join('') ?? '';
        if (text.length > lastTextLen) {
          options.onEvent({ type: 'text', delta: text.slice(lastTextLen) });
          lastTextLen = text.length;
        }
      } else if (item.type === 'function_call' && item.status === 'completed') {
        callNames.set(item.callId, item.name);
        const args = item.arguments ? JSON.parse(item.arguments) : {};
        options.onEvent({ type: 'tool_call', name: item.name, callId: item.callId, args });
      } else if (item.type === 'function_call_output') {
        const out = typeof item.output === 'string' ? item.output : JSON.stringify(item.output);
        options.onEvent({
          type: 'tool_result',
          name: callNames.get(item.callId) ?? 'unknown',
          callId: item.callId,
          output: out.length > 200 ? out.slice(0, 200) + '…' : out,
        });
      } else if (item.type === 'reasoning') {
        const text = item.summary?.map((s: { text: string }) => s.text).join('') ?? '';
        if (text) options.onEvent({ type: 'reasoning', delta: text });
      }
    }
  }

  const response = await result.getResponse();
  return { text: response.outputText ?? '', usage: response.usage, output: response.output };
}

export async function runAgentWithRetry(
  config: AgentConfig,
  input: string | ChatMessage[],
  options?: { onEvent?: (event: AgentEvent) => void; maxRetries?: number },
) {
  for (let attempt = 0, max = options?.maxRetries ?? 3; attempt <= max; attempt++) {
    try { return await runAgent(config, input, options); }
    catch (err: any) {
      const s = err?.status ?? err?.statusCode;
      if (!(s === 429 || (s >= 500 && s < 600)) || attempt === max) throw err;
      await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 30000)));
    }
  }
  throw new Error('Unreachable');
}
```

### src/cli.ts

```typescript
import { createInterface, type Interface } from 'readline';
import { loadConfig, type AgentConfig } from './config.js';
import { runAgentWithRetry, type AgentEvent } from './agent.js';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';
const BG_INPUT = '\x1b[100m';
const WHITE = '\x1b[97m';

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function summarizeArgs(name: string, args: Record<string, unknown>): string {
  const key = { shell: 'command', file_read: 'path', file_write: 'path',
    file_edit: 'path', glob: 'pattern', grep: 'pattern', web_search: 'query',
  }[name] ?? Object.keys(args)[0];
  if (!key || !(key in args)) return '';
  const val = String(args[key]);
  return `${key}=${val.length > 40 ? val.slice(0, 40) + '…' : val}`;
}

function ask(rl: Interface, prompt: string): Promise<string> {
  return new Promise((r) => rl.question(prompt, r));
}

async function selectModel(config: AgentConfig, rl: Interface): Promise<void> {
  const query = await ask(rl, `  ${DIM}Search models:${RESET} `);
  if (!query.trim()) return;
  process.stdout.write(`  ${DIM}Fetching…${RESET}`);
  const res = await fetch('https://openrouter.ai/api/v1/models');
  const { data } = await res.json() as { data: { id: string; name: string }[] };
  process.stdout.write('\r\x1b[K');
  const q = query.toLowerCase();
  const matches = data.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, 15);
  if (!matches.length) { console.log(`  ${DIM}No models matching "${query}".${RESET}\n`); return; }
  matches.forEach((m, i) => console.log(`  ${DIM}${String(i + 1).padStart(2)})${RESET} ${m.id}`));
  const pick = await ask(rl, `\n  ${DIM}Select (1-${matches.length}):${RESET} `);
  const idx = parseInt(pick) - 1;
  if (idx >= 0 && idx < matches.length) {
    config.model = matches[idx].id;
    console.log(`  ${DIM}Model →${RESET} ${CYAN}${config.model}${RESET}\n`);
  } else { console.log(`  ${DIM}Cancelled.${RESET}\n`); }
}

async function main() {
  const config = loadConfig();

  const width = Math.min(process.stdout.columns || 60, 60);
  const line = GRAY + '─'.repeat(width) + RESET;
  console.log(`\n${line}`);
  console.log(`  ${BOLD}My Agent${RESET}  ${DIM}v0.1.0${RESET}`);
  console.log(`  ${DIM}model${RESET}  ${CYAN}${config.model}${RESET}`);
  if (config.slashCommands) console.log(`  ${DIM}/model to change${RESET}`);
  console.log(`${line}\n`);

  const styled = config.display.inputStyle === 'styled';
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: styled ? `${BG_INPUT}\x1b[K ${WHITE}›${RESET}${BG_INPUT}${WHITE} ` : `${GREEN}>${RESET} `,
  });
  function showPrompt() {
    if (styled) {
      process.stdout.write('\n\n\n\x1b[3A\r');
      process.stdout.write(`${BG_INPUT}\x1b[K${RESET}\n`);
    }
    rl.prompt();
    if (styled) {
      const cwd = process.cwd().replace(process.env.HOME ?? '', '~');
      process.stdout.write(`\x1b7\n${BG_INPUT}\x1b[K ${DIM}${cwd}${RESET}\x1b8`);
    }
  }
  showPrompt();

  rl.on('line', async (input) => {
    if (styled) process.stdout.write(`\r${BG_INPUT}\x1b[K${RESET}\n`);
    else process.stdout.write(RESET);
    const trimmed = input.trim();
    if (!trimmed) { showPrompt(); return; }
    if (trimmed.toLowerCase() === 'exit') { rl.close(); process.exit(0); }
    if (trimmed === '/model' && config.slashCommands) {
      console.log(`  ${DIM}Current:${RESET} ${CYAN}${config.model}${RESET}`);
      await selectModel(config, rl);
      showPrompt(); return;
    }

    console.log();
    let streaming = false;
    let started = false;
    const toolStart = new Map<string, number>();

    const dots = ['·', '··', '···'];
    let di = 0;
    const spin = setInterval(() => {
      if (!started) process.stdout.write(`\r${DIM}${dots[di++ % 3]}${RESET}`);
    }, 300);

    const handleEvent = (event: AgentEvent) => {
      if (!started) { started = true; process.stdout.write('\r\x1b[K'); }
      if (event.type === 'text') {
        if (!streaming) { streaming = true; process.stdout.write(CYAN); }
        process.stdout.write(event.delta);
      } else if (event.type === 'tool_call') {
        if (streaming) { process.stdout.write(RESET + '\n'); streaming = false; }
        toolStart.set(event.callId, Date.now());
        const args = summarizeArgs(event.name, event.args);
        console.log(`  ${YELLOW}⚡${RESET} ${DIM}${event.name}${args ? ' ' + args : ''}${RESET}`);
      } else if (event.type === 'tool_result') {
        const ms = Date.now() - (toolStart.get(event.callId) ?? Date.now());
        console.log(`  ${GREEN}✓${RESET} ${DIM}${event.name} (${(ms / 1000).toFixed(1)}s)${RESET}`);
        started = false;
      }
    };

    try {
      const result = await runAgentWithRetry(config, trimmed, { onEvent: handleEvent });
      clearInterval(spin);
      if (streaming) process.stdout.write(RESET);

      const inT = result.usage?.inputTokens ?? 0;
      const outT = result.usage?.outputTokens ?? 0;
      console.log(`\n${GRAY}  ${formatTokens(inT)} in · ${formatTokens(outT)} out${RESET}\n`);
    } catch (err: any) {
      clearInterval(spin);
      if (streaming) process.stdout.write(RESET);
      console.log(`\n${YELLOW}  Error: ${err.message}${RESET}\n`);
    }
    showPrompt();
  });

  rl.on('close', () => process.exit(0));
}

main();
```

---

## ASCII Logo Banner

When `ASCII Logo Banner` is selected, ask the user for their project name, then generate `src/banner.ts` with ASCII art of that name. Use a block-letter style with the `█` character for the art. The banner should fit in a 60-column terminal.

### src/banner.ts

Generate ASCII art for the user's project name. Example for a project called "ACME":

```typescript
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';

const LOGO = `
   █████╗  ██████╗███╗   ███╗███████╗
  ██╔══██╗██╔════╝████╗ ████║██╔════╝
  ███████║██║     ██╔████╔██║█████╗
  ██╔══██║██║     ██║╚██╔╝██║██╔══╝
  ██║  ██║╚██████╗██║ ╚═╝ ██║███████╗
  ╚═╝  ╚═╝ ╚═════╝╚═╝     ╚═╝╚══════╝`;

export function printBanner(model: string): void {
  console.log(CYAN + BOLD + LOGO + RESET);
  console.log(`  ${DIM}model  ${RESET}${model}\n`);
}
```

Adapt the ASCII art to the user's actual project name. Keep it to one or two short words that fit in 60 columns.

### Wire into src/cli.ts

Add at the top of `main()`, before the text banner, when `showBanner` is selected:

```typescript
import { printBanner } from './banner.js';

// In main(), replace the text banner with:
if (config.showBanner) {
  printBanner(config.model);
} else {
  // fall back to the text banner from the cli.ts template above
}
```

Add `showBanner: boolean` to `AgentConfig` (default `false`). Enable via `agent.config.json` or `loadConfig({ showBanner: true })`.

---

## Reference Files

For content beyond the core files:

- **[references/tools.md](references/tools.md)** — Specs for all user-defined tools: file-read, file-write, file-edit, glob, grep, list-dir, shell, js-repl, sub-agent, plan, request-input, web-fetch, view-image, custom template
- **[references/modules.md](references/modules.md)** — Harness modules: session persistence, context compaction, system prompt composition, tool approval, structured logging
- **[references/tui.md](references/tui.md)** — TUI renderer: tool call display, message coloring, per-tool formatters, display config
- **[references/slash-commands.md](references/slash-commands.md)** — Slash command registry: /model, /new, /help, /compact, /session, /export
- **[references/server-entry-points.md](references/server-entry-points.md)** — Express/Hono API server entry point with SSE streaming, plus extension points (MCP, WebSocket, dynamic models)
