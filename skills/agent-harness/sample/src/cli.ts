import { createInterface } from 'readline';
import { loadConfig } from './config.js';
import { runAgentWithRetry, type ChatMessage } from './agent.js';
import { initSessionDir, saveMessage, newSessionPath } from './session.js';
import { printBanner } from './banner.js';
import { TuiRenderer } from './renderer.js';
import { dispatch, type CommandContext } from './commands.js';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';
const BG_INPUT = '\x1b[100m';
const WHITE = '\x1b[97m';

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

async function main() {
  const config = loadConfig();

  initSessionDir(config.sessionDir);
  let sessionPath = newSessionPath(config.sessionDir);
  const messages: ChatMessage[] = [];

  if (config.showBanner) {
    printBanner(config.model);
  } else {
    textBanner(config.model);
  }
  if (config.slashCommands) console.log(`  ${DIM}/help for commands${RESET}\n`);

  const renderer = new TuiRenderer({ display: config.display });

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
  const cmdCtx: CommandContext = {
    config,
    rl,
    messages,
    sessionPath,
    resetSession: () => { sessionPath = newSessionPath(config.sessionDir); return sessionPath; },
    totalTokens: { input: 0, output: 0 },
  };

  showPrompt();

  rl.on('line', async (input) => {
    if (styled) process.stdout.write(`\r${BG_INPUT}\x1b[K${RESET}\n`);
    else process.stdout.write(RESET);
    const trimmed = input.trim();
    if (!trimmed) { showPrompt(); return; }
    if (trimmed.toLowerCase() === 'exit') {
      console.log(`\n${DIM}Goodbye.${RESET}\n`);
      rl.close();
      process.exit(0);
    }
    if (trimmed.startsWith('/') && config.slashCommands) {
      await dispatch(trimmed, cmdCtx);
      showPrompt(); return;
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
      cmdCtx.totalTokens.input += inT;
      cmdCtx.totalTokens.output += outT;
      console.log(`\n${GRAY}  ${formatTokens(inT)} in · ${formatTokens(outT)} out${RESET}\n`);
    } catch (err: any) {
      clearInterval(spin);
      renderer.endStreaming();
      console.log(`\n${YELLOW}  Error: ${err.message}${RESET}\n`);
    }
    showPrompt();
  });

  rl.on('close', () => process.exit(0));
}

main();
