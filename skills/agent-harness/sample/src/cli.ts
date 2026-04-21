import { createInterface } from 'readline';
import { loadConfig } from './config.js';
import { runAgentWithRetry, type ChatMessage } from './agent.js';
import { initSessionDir, saveMessage, newSessionPath } from './session.js';
import { printBanner } from './banner.js';

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
  console.log(`  ${BOLD}Agent Harness${RESET}  ${DIM}sample${RESET}`);
  console.log(`  ${DIM}model${RESET}  ${CYAN}${model}${RESET}`);
  console.log(line);
  console.log(`  ${DIM}Type a message to start. "exit" to quit.${RESET}`);
  console.log();
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
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

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${GREEN}>${RESET} `,
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }
    if (input.toLowerCase() === 'exit') {
      console.log(`\n${DIM}Goodbye.${RESET}\n`);
      rl.close();
      process.exit(0);
    }

    messages.push({ role: 'user', content: input });
    saveMessage(sessionPath, { role: 'user', content: input });

    console.log();

    const spinnerFrames = ['·', '··', '···'];
    let spinnerIdx = 0;
    let receivedText = false;
    const spinner = setInterval(() => {
      if (!receivedText) {
        process.stdout.write(`\r${DIM}${spinnerFrames[spinnerIdx++ % spinnerFrames.length]}${RESET}`);
      }
    }, 300);

    try {
      const agentInput = messages.length > 1 ? messages : input;

      const result = await runAgentWithRetry(config, agentInput, {
        onText: (delta) => {
          if (!receivedText) {
            receivedText = true;
            process.stdout.write('\r\x1b[K');
          }
          process.stdout.write(delta);
        },
      });

      clearInterval(spinner);
      process.stdout.write(RESET);

      messages.push({ role: 'assistant', content: result.text });
      saveMessage(sessionPath, { role: 'assistant', content: result.text });

      const inTok = result.usage?.inputTokens ?? 0;
      const outTok = result.usage?.outputTokens ?? 0;
      console.log(`\n${GRAY}  ${formatTokens(inTok)} in · ${formatTokens(outTok)} out${RESET}\n`);
    } catch (err: any) {
      clearInterval(spinner);
      process.stdout.write(RESET);
      console.log(`\n${YELLOW}  Error: ${err.message}${RESET}\n`);
    }

    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

main();
