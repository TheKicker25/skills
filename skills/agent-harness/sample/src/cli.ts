import { createInterface, type Interface } from 'readline';
import { loadConfig, type AgentConfig } from './config.js';
import { runAgentWithRetry, type ChatMessage } from './agent.js';
import { initSessionDir, saveMessage, newSessionPath } from './session.js';
import { printBanner } from './banner.js';
import { TuiRenderer } from './renderer.js';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';

function textBanner(model: string) {
  const width = Math.min(process.stdout.columns || 60, 60);
  const line = GRAY + '─'.repeat(width) + RESET;
  console.log();
  console.log(line);
  console.log(`  ${BOLD}My Harness${RESET}  ${DIM}sample${RESET}`);
  console.log(`  ${DIM}model${RESET}  ${CYAN}${model}${RESET}`);
  console.log(line);
  console.log(`  ${DIM}Type a message to start. "exit" to quit.${RESET}`);
  console.log();
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
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

  initSessionDir(config.sessionDir);
  const sessionPath = newSessionPath(config.sessionDir);
  const messages: ChatMessage[] = [];

  if (config.showBanner) {
    printBanner(config.model);
  } else {
    textBanner(config.model);
  }
  if (config.slashCommands) console.log(`  ${DIM}/model to change${RESET}\n`);

  const renderer = new TuiRenderer({ display: config.display });

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${GREEN}>${RESET} `,
  });
  rl.prompt();

  rl.on('line', async (input) => {
    const trimmed = input.trim();
    if (!trimmed) { rl.prompt(); return; }
    if (trimmed.toLowerCase() === 'exit') {
      console.log(`\n${DIM}Goodbye.${RESET}\n`);
      rl.close();
      process.exit(0);
    }
    if (trimmed === '/model' && config.slashCommands) {
      console.log(`  ${DIM}Current:${RESET} ${CYAN}${config.model}${RESET}`);
      await selectModel(config, rl);
      rl.prompt(); return;
    }

    messages.push({ role: 'user', content: trimmed });
    saveMessage(sessionPath, { role: 'user', content: trimmed });

    console.log();
    let started = false;
    const dots = ['·', '··', '···'];
    let di = 0;
    const spin = setInterval(() => {
      if (!started) process.stdout.write(`\r${DIM}${dots[di++ % 3]}${RESET}`);
    }, 300);

    try {
      const agentInput = messages.length > 1 ? messages : trimmed;
      const result = await runAgentWithRetry(config, agentInput, {
        onEvent: (e) => {
          if (!started) { started = true; process.stdout.write('\r\x1b[K'); }
          renderer.handle(e);
          if (e.type === 'tool_result') started = false;
        },
      });
      clearInterval(spin);
      renderer.endStreaming();

      messages.push({ role: 'assistant', content: result.text });
      saveMessage(sessionPath, { role: 'assistant', content: result.text });

      const inT = result.usage?.inputTokens ?? 0;
      const outT = result.usage?.outputTokens ?? 0;
      console.log(`\n${GRAY}  ${formatTokens(inT)} in · ${formatTokens(outT)} out${RESET}\n`);
    } catch (err: any) {
      clearInterval(spin);
      renderer.endStreaming();
      console.log(`\n${YELLOW}  Error: ${err.message}${RESET}\n`);
    }
    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

main();
