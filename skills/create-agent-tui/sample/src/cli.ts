import { createInterface } from 'readline';
import { loadConfig } from './config.js';
import { runAgentWithRetry, type ChatMessage } from './agent.js';
import { initSessionDir, saveMessage, newSessionPath } from './session.js';
import { printBanner } from './banner.js';
import { TuiRenderer } from './renderer.js';
import { dispatch, type CommandContext } from './commands.js';
import { detectBg } from './terminal-bg.js';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const GRAY = '\x1b[90m';
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

function styledReadLine(bg: string): Promise<string> {
  return new Promise((resolve) => {
    let line = '';
    let first = true;

    function draw() {
      if (first) {
        process.stdout.write(`\n${bg}\x1b[K${RESET}\n`);
        process.stdout.write(`${bg}\x1b[K ${WHITE}›${RESET}${bg}${WHITE} ${line}${RESET}\n`);
        process.stdout.write(`${bg}\x1b[K${RESET}\x1b[1A\r\x1b[4G`);
        first = false;
      } else {
        process.stdout.write(`\r\x1b[2K`);
        process.stdout.write(`${bg}\x1b[K ${WHITE}›${RESET}${bg}${WHITE} ${line}${RESET}`);
      }
    }

    draw();

    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onData = (data: Buffer) => {
      const str = data.toString('utf-8');
      if (str.startsWith('\x1b')) return;
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code === 13 || code === 10) {
          process.stdin.off('data', onData);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write(`${RESET}\n`);
          resolve(line);
          return;
        } else if (code === 127 || code === 8) {
          line = line.slice(0, -1);
          draw();
        } else if (code === 3) {
          process.stdout.write(`${RESET}\n`);
          process.exit(0);
        } else if (code >= 32) {
          line += str[i];
          draw();
        }
      }
    };

    process.stdin.on('data', onData);
  });
}

function borderedReadLine(borderColor = GRAY): Promise<string> {
  return new Promise((resolve) => {
    let line = '';
    let first = true;
    const width = process.stdout.columns || 80;
    const border = `${borderColor}${'─'.repeat(width)}${RESET}`;

    function draw() {
      if (first) {
        process.stdout.write(`\n${border}\n`);
        process.stdout.write(`› ${line}\n`);
        process.stdout.write(`${border}\x1b[1A\r\x1b[${3 + line.length}G`);
        first = false;
      } else {
        process.stdout.write(`\r\x1b[2K`);
        process.stdout.write(`› ${line}`);
      }
    }

    draw();

    process.stdin.setRawMode(true);
    process.stdin.resume();

    const onData = (data: Buffer) => {
      const str = data.toString('utf-8');
      if (str.startsWith('\x1b')) return;
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code === 13 || code === 10) {
          process.stdin.off('data', onData);
          process.stdin.setRawMode(false);
          process.stdin.pause();
          if (!line) {
            process.stdout.write(`\x1b[1A\x1b[2K\x1b[1A\x1b[2K\r`);
          } else {
            process.stdout.write(`\x1b[1B\x1b[2K\r`);
          }
          resolve(line);
          return;
        } else if (code === 127 || code === 8) {
          line = line.slice(0, -1);
          draw();
        } else if (code === 3) {
          process.stdout.write(`${RESET}\n`);
          process.exit(0);
        } else if (code >= 32) {
          line += str[i];
          draw();
        }
      }
    };

    process.stdin.on('data', onData);
  });
}

async function main() {
  const config = loadConfig();
  const BG_INPUT = config.display.inputStyle === 'block' ? await detectBg() : '';

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

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${GREEN}>${RESET} `,
  });

  const cmdCtx: CommandContext = {
    config,
    rl,
    messages,
    sessionPath,
    resetSession: () => { sessionPath = newSessionPath(config.sessionDir); return sessionPath; },
    totalTokens: { input: 0, output: 0 },
  };

  async function getInput(): Promise<string> {
    switch (config.display.inputStyle) {
      case 'block': return styledReadLine(BG_INPUT);
      case 'bordered': return borderedReadLine();
      case 'plain':
      default:
        return new Promise((resolve) => {
          rl.prompt();
          rl.once('line', resolve);
        });
    }
  }

  async function loop() {
    while (true) {
      const input = await getInput();
      const trimmed = input.trim();
      if (!trimmed) continue;

      if (config.display.inputStyle !== 'plain') {
        const cwd = process.cwd().replace(process.env.HOME ?? '', '~');
        process.stdout.write(`\x1b[K  ${DIM}${cwd}${RESET}\n`);
      }

      if (trimmed.toLowerCase() === 'exit') {
        console.log(`\n${DIM}Goodbye.${RESET}\n`);
        process.exit(0);
      }
      if (trimmed.startsWith('/') && config.slashCommands) {
        await dispatch(trimmed, cmdCtx);
        continue;
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
        renderer.endTurn();

        messages.push({ role: 'assistant', content: result.text });
        saveMessage(sessionPath, { role: 'assistant', content: result.text });

        const inT = result.usage?.inputTokens ?? 0;
        const outT = result.usage?.outputTokens ?? 0;
        cmdCtx.totalTokens.input += inT;
        cmdCtx.totalTokens.output += outT;
        console.log(`\n${GRAY}  ${formatTokens(inT)} in · ${formatTokens(outT)} out${RESET}\n`);
      } catch (err: any) {
        clearInterval(spin);
        renderer.endTurn();
        console.log(`\n${YELLOW}  Error: ${err.message}${RESET}\n`);
      }
    }
  }

  loop();
}

main();
