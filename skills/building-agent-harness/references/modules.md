# Harness Modules

Optional architectural modules that extend the core harness. Each section includes purpose, complete code, and how to wire it into `agent.ts` and `cli.ts`.

## Contents

- [Session Persistence](#session-persistence) — JSONL conversation log (DEFAULT ON)
- [Context Compaction](#context-compaction) — summarize older messages
- [System Prompt Composition](#system-prompt-composition) — dynamic instructions from context files
- [Tool Approval](#tool-approval) — gate dangerous tools behind user confirmation
- [Structured Event Logging](#structured-event-logging) — emit events for observability

---

## Session Persistence

JSONL (newline-delimited JSON) append-only log for crash-safe conversation persistence. Pattern from pi-mono's session manager.

### src/session.ts

```typescript
import { appendFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

type Message = { role: string; content: string; [key: string]: unknown };

interface SessionEntry {
  timestamp: string;
  message: Message;
}

export function initSessionDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function saveMessage(sessionPath: string, message: Message): void {
  const entry: SessionEntry = {
    timestamp: new Date().toISOString(),
    message,
  };
  appendFileSync(sessionPath, JSON.stringify(entry) + '\n');
}

export function loadSession(sessionPath: string): Message[] {
  if (!existsSync(sessionPath)) return [];

  return readFileSync(sessionPath, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const entry: SessionEntry = JSON.parse(line);
      return entry.message;
    });
}

export function listSessions(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .sort();
}

export function newSessionPath(dir: string): string {
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  return join(dir, `${id}.jsonl`);
}
```

### Integration

In `cli.ts`, wrap the message loop:

```typescript
import { initSessionDir, loadSession, saveMessage, newSessionPath } from './session.js';

// At startup:
initSessionDir(config.sessionDir);
const sessionPath = newSessionPath(config.sessionDir);
const messages = loadSession(sessionPath); // empty for new, or pass existing path

// After each exchange:
saveMessage(sessionPath, { role: 'user', content: input });
saveMessage(sessionPath, { role: 'assistant', content: result.text });
```

---

## Context Compaction

When conversation history grows too long, summarize older messages to fit within the model's context window. Pattern from pi-mono's compaction with file tracking.

### src/compaction.ts

```typescript
import { OpenRouter } from '@openrouter/agent';

type Message = { role: string; content: string; [key: string]: unknown };

interface CompactionConfig {
  /** Max messages before triggering compaction */
  threshold: number;
  /** Number of recent messages to preserve verbatim */
  keepRecent: number;
  /** Model to use for summarization */
  model: string;
}

const DEFAULTS: CompactionConfig = {
  threshold: 40,
  keepRecent: 10,
  model: 'openai/gpt-4.1-mini',
};

export async function compactMessages(
  client: OpenRouter,
  messages: Message[],
  config: Partial<CompactionConfig> = {},
): Promise<Message[]> {
  const opts = { ...DEFAULTS, ...config };

  if (messages.length <= opts.threshold) return messages;

  const toSummarize = messages.slice(0, -opts.keepRecent);
  const toKeep = messages.slice(-opts.keepRecent);

  const summaryResult = client.callModel({
    model: opts.model,
    instructions:
      'Summarize the following conversation concisely. Preserve key facts, decisions, file paths mentioned, and tool results. Output only the summary.',
    input: toSummarize.map((m) => `${m.role}: ${m.content}`).join('\n\n'),
  });

  const summary = await summaryResult.getText();

  return [
    { role: 'system', content: `[Conversation summary]\n${summary}` },
    ...toKeep,
  ];
}
```

### Integration

In `agent.ts`, call before `callModel`:

```typescript
import { compactMessages } from './compaction.js';

// Inside runAgent, before calling callModel:
const compacted = await compactMessages(client, messages, {
  threshold: 40,
  keepRecent: 10,
});
// Use compacted as the input to callModel
```

---

## System Prompt Composition

Compose the system prompt from a static base plus dynamically loaded context files (similar to how pi-mono loads AGENTS.md/CLAUDE.md from project directories).

### src/system-prompt.ts

```typescript
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

interface PromptConfig {
  /** Base system prompt */
  base: string;
  /** File names to look for in the project directory */
  contextFiles: string[];
  /** Directory to search for context files */
  projectDir: string;
}

export function composeSystemPrompt(config: PromptConfig): string {
  const parts = [config.base];

  for (const filename of config.contextFiles) {
    const filePath = resolve(config.projectDir, filename);
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf-8');
      parts.push(`\n## ${filename}\n\n${content}`);
    }
  }

  return parts.join('\n');
}
```

### Integration

In `agent.ts`, use as the `instructions` parameter:

```typescript
import { composeSystemPrompt } from './system-prompt.js';

const instructions = composeSystemPrompt({
  base: config.systemPrompt,
  contextFiles: ['AGENTS.md', 'CLAUDE.md', '.agent-context.md'],
  projectDir: process.cwd(),
});

// Pass to callModel:
client.callModel({ instructions, ... });
```

---

## Tool Approval

Gate dangerous tools behind user confirmation. Uses `requireApproval` from `@openrouter/agent/tool` plus a session-scoped approval cache. Pattern from Codex's approval flow.

### Adding requireApproval to tools

For tools that should require approval, set `requireApproval: true` in the tool definition:

```typescript
export const shellTool = tool({
  name: 'shell',
  description: 'Execute a shell command',
  inputSchema: z.object({ command: z.string(), timeout: z.number().optional() }),
  requireApproval: true,  // <-- user must confirm before execution
  execute: async ({ command, timeout }) => { /* ... */ },
});
```

Or use a function for conditional approval based on the config:

```typescript
export function createShellTool(approvalPolicy: 'always' | 'never' | 'dangerous-only') {
  return tool({
    name: 'shell',
    description: 'Execute a shell command',
    inputSchema: z.object({ command: z.string(), timeout: z.number().optional() }),
    requireApproval: approvalPolicy !== 'never',
    execute: async ({ command, timeout }) => { /* ... */ },
  });
}
```

### Integration

Add `approvalPolicy` to the config:

```typescript
// In config.ts AgentConfig interface:
approvalPolicy: 'always' | 'never' | 'dangerous-only';

// In tools/index.ts, create tools conditionally:
import { createShellTool } from './shell.js';

export function buildTools(config: AgentConfig) {
  return [
    fileReadTool,   // never needs approval
    fileWriteTool,  // maybe
    createShellTool(config.approvalPolicy),
  ];
}
```

---

## Structured Event Logging

Emit structured events for tool calls, API requests, and errors. Entry point decides how to render them. Pattern from Codex's tracing.

### src/logger.ts

```typescript
type EventType = 'tool_call' | 'tool_result' | 'api_request' | 'api_error' | 'turn_start' | 'turn_end';

interface AgentEvent {
  type: EventType;
  timestamp: string;
  data: Record<string, unknown>;
}

type EventHandler = (event: AgentEvent) => void;

export class AgentLogger {
  private handlers: EventHandler[] = [];

  on(handler: EventHandler): void {
    this.handlers.push(handler);
  }

  emit(type: EventType, data: Record<string, unknown>): void {
    const event: AgentEvent = {
      type,
      timestamp: new Date().toISOString(),
      data,
    };
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}

/** Default handler that logs to stderr as JSON */
export function consoleLogHandler(event: AgentEvent): void {
  process.stderr.write(JSON.stringify(event) + '\n');
}
```

### Integration

In `agent.ts`, emit events in callbacks:

```typescript
import { AgentLogger } from './logger.js';

export async function runAgent(config: AgentConfig, input, options?) {
  const logger = options?.logger ?? new AgentLogger();

  const result = client.callModel({
    // ...
    onTurnStart: async (ctx) => {
      logger.emit('turn_start', { turn: ctx.numberOfTurns });
    },
    onTurnEnd: async (ctx) => {
      logger.emit('turn_end', { turn: ctx.numberOfTurns });
    },
  });
  // ...
}
```

In `cli.ts`, attach a handler:

```typescript
import { AgentLogger, consoleLogHandler } from './logger.js';

const logger = new AgentLogger();
logger.on(consoleLogHandler); // or a custom handler
```
