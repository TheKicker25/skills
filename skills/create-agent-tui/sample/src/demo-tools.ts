import { TuiRenderer } from './renderer.js';
import type { DisplayConfig } from './config.js';
import type { AgentEvent } from './agent.js';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

const style = (process.argv[2] ?? 'emoji') as DisplayConfig['toolDisplay'];

const display: DisplayConfig = {
  toolDisplay: style,
  reasoning: false,
  inputStyle: 'block',
};

const renderer = new TuiRenderer({ display });

const width = Math.min(process.stdout.columns || 60, 60);
const line = GRAY + '─'.repeat(width) + RESET;
console.log();
console.log(line);
console.log(`  ${BOLD}My Agent${RESET}  ${DIM}demo${RESET}`);
console.log(`  ${DIM}tool display${RESET}  ${CYAN}${style}${RESET}`);
console.log(line);
console.log();

function emit(event: AgentEvent) {
  renderer.handle(event);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  process.stdout.write(`${DIM}> what's in this repo${RESET}\n\n`);

  emit({ type: 'text', delta: "I'll explore the repository structure to understand what's here.\n\n" });
  renderer.endTurn();

  await sleep(100);
  emit({ type: 'tool_call', name: 'shell', callId: 'c1', args: { command: 'pwd' } });
  await sleep(200);
  emit({ type: 'tool_result', name: 'shell', callId: 'c1', output: '/Users/alex/Projects/OpenRouter/skills/skills/create-agent-tui/sample' });

  await sleep(100);
  emit({ type: 'tool_call', name: 'list_dir', callId: 'c2', args: { path: '.' } });
  await sleep(150);
  emit({ type: 'tool_result', name: 'list_dir', callId: 'c2', output: 'src/ node_modules/ package.json tsconfig.json' });

  await sleep(100);
  emit({ type: 'tool_call', name: 'list_dir', callId: 'c2b', args: { path: 'src/' } });
  await sleep(150);
  emit({ type: 'tool_result', name: 'list_dir', callId: 'c2b', output: 'cli.ts agent.ts config.ts renderer.ts session.ts banner.ts' });

  await sleep(100);
  emit({ type: 'tool_call', name: 'file_read', callId: 'c4', args: { path: 'package.json' } });
  await sleep(100);
  emit({ type: 'tool_result', name: 'file_read', callId: 'c4', output: '{"name":"sample","version":"1.0.0","dependencies":{"@openrouter/agent":"^0.4.0"}}' });

  await sleep(100);
  emit({ type: 'tool_call', name: 'grep', callId: 'c5', args: { pattern: 'export', path: 'src/' } });
  await sleep(200);
  emit({ type: 'tool_result', name: 'grep', callId: 'c5', output: 'src/agent.ts:export async function runAgent\nsrc/config.ts:export function loadConfig' });

  renderer.endTurn();

  await sleep(100);
  emit({ type: 'text', delta: '\nThis is an ' });
  emit({ type: 'text', delta: 'agent TUI' });
  emit({ type: 'text', delta: ' built with `@openrouter/agent`. It includes:\n\n' });
  emit({ type: 'text', delta: '- **CLI entry point** (`src/cli.ts`) with styled TUI input\n' });
  emit({ type: 'text', delta: '- **Agent runner** (`src/agent.ts`) with retry logic\n' });
  emit({ type: 'text', delta: '- **Tool renderer** (`src/renderer.ts`) for tool call display\n' });
  emit({ type: 'text', delta: '- **Session persistence** via JSONL logging\n' });
  renderer.endTurn();

  console.log();
  console.log(`${GRAY}  1.2k in · 340 out${RESET}`);
  console.log();

  await new Promise((r) => setTimeout(r, 10000));
}

run();
