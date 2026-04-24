const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const GRAY = '\x1b[90m';
const WHITE = '\x1b[97m';

const style = process.argv[2] ?? 'block';
const COLUMNS = process.stdout.columns || parseInt(process.env.COLUMNS || '') || 80;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const line = GRAY + '─'.repeat(Math.min(COLUMNS, 100)) + RESET;

  await sleep(100);
  console.log();
  console.log(line);
  await sleep(50);
  console.log(`  ${BOLD}My Agent${RESET}  ${DIM}demo${RESET}`);
  await sleep(50);
  console.log(`  ${DIM}input style${RESET}  ${CYAN}${style}${RESET}`);
  console.log(line);
  await sleep(50);
  console.log(`  ${DIM}Type a message to start. "exit" to quit.${RESET}`);
  console.log();
  await sleep(50);

  switch (style) {
    case 'block': {
      const bg = '\x1b[48;2;40;42;54m';
      process.stdout.write(`\n${bg}\x1b[K${RESET}\n`);
      await sleep(50);
      process.stdout.write(`${bg}\x1b[K ${WHITE}›${RESET}${bg}${WHITE} ${RESET}\n`);
      await sleep(50);
      process.stdout.write(`${bg}\x1b[K${RESET}\n`);
      break;
    }
    case 'bordered': {
      const border = `${GRAY}${'─'.repeat(COLUMNS)}${RESET}`;
      process.stdout.write(`\n${border}\n`);
      await sleep(50);
      process.stdout.write(`› \n`);
      await sleep(50);
      process.stdout.write(`${border}\n`);
      break;
    }
    case 'plain': {
      process.stdout.write(`\n${GREEN}>${RESET} \n`);
      break;
    }
  }

  await sleep(10000);
}

run();
