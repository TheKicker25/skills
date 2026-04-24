const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

const style = process.argv[2] ?? 'gradient';
const text = 'Working';

const width = Math.min(process.stdout.columns || parseInt(process.env.COLUMNS || '') || 80, 100);
const line = GRAY + '─'.repeat(width) + RESET;
console.log();
console.log(line);
console.log(`  ${BOLD}My Agent${RESET}  ${DIM}demo${RESET}`);
console.log(`  ${DIM}loader${RESET}  ${CYAN}${style}${RESET}`);
console.log(line);
console.log();

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const GRADIENT_COLORS = [
  '\x1b[38;5;240m',
  '\x1b[38;5;245m',
  '\x1b[38;5;250m',
  '\x1b[38;5;255m',
  '\x1b[38;5;250m',
  '\x1b[38;5;245m',
];

let frame = 0;

function draw() {
  frame++;
  switch (style) {
    case 'minimal': {
      const dots = ['·', '··', '···'];
      process.stdout.write(`\r${DIM}${text}${dots[frame % 3]}${RESET}\x1b[K`);
      break;
    }
    case 'spinner': {
      const char = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
      process.stdout.write(`\r${DIM}${char} ${text}${RESET}\x1b[K`);
      break;
    }
    case 'gradient': {
      const len = GRADIENT_COLORS.length;
      let out = '\r';
      for (let i = 0; i < text.length; i++) {
        const ci = (frame + i) % len;
        out += GRADIENT_COLORS[ci] + text[i];
      }
      out += RESET + '\x1b[K';
      process.stdout.write(out);
      break;
    }
  }
}

// Draw several frames to show the animation mid-cycle
const ms = style === 'gradient' ? 150 : style === 'spinner' ? 80 : 300;
const totalFrames = style === 'minimal' ? 8 : style === 'gradient' ? 20 : 30;
let drawn = 0;
const iv = setInterval(() => {
  draw();
  drawn++;
  if (drawn >= totalFrames) {
    clearInterval(iv);
    process.stdout.write('\n');
  }
}, ms);

await new Promise((r) => setTimeout(r, 10000));
