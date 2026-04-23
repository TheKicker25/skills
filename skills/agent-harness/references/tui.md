# TUI Renderer

The default `cli.ts` template handles basic tool call display inline. For richer customization — per-tool colors, expandable output, custom formatters — generate a separate `src/renderer.ts` module.

---

## src/renderer.ts

```typescript
import type { AgentEvent } from './agent.js';
import type { DisplayConfig } from './config.js';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const GRAY = '\x1b[90m';
const MAGENTA = '\x1b[35m';

type ToolFormatter = (name: string, args: Record<string, unknown>) => string;

const DEFAULT_FORMATTERS: Record<string, ToolFormatter> = {
  shell: (_n, a) => `command=${trunc(String(a.command ?? ''))}`,
  file_read: (_n, a) => `path=${trunc(String(a.path ?? ''))}`,
  file_write: (_n, a) => `path=${trunc(String(a.path ?? ''))}`,
  file_edit: (_n, a) => `path=${trunc(String(a.path ?? ''))}`,
  glob: (_n, a) => `pattern=${trunc(String(a.pattern ?? ''))}`,
  grep: (_n, a) => `pattern=${trunc(String(a.pattern ?? ''))}`,
  list_dir: (_n, a) => `path=${trunc(String(a.path ?? ''))}`,
  web_search: (_n, a) => `query=${trunc(String(a.query ?? ''))}`,
};

function trunc(s: string, max = 50): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export interface RendererOptions {
  display: DisplayConfig;
  toolFormatters?: Record<string, ToolFormatter>;
  toolColors?: Record<string, string>;
}

export class TuiRenderer {
  private display: DisplayConfig;
  private formatters: Record<string, ToolFormatter>;
  private toolColors: Record<string, string>;
  private toolStart = new Map<string, number>();
  private streaming = false;

  constructor(opts: RendererOptions) {
    this.display = opts.display;
    this.formatters = { ...DEFAULT_FORMATTERS, ...opts.toolFormatters };
    this.toolColors = { shell: RED, web_search: MAGENTA, ...opts.toolColors };
  }

  handle(event: AgentEvent): void {
    switch (event.type) {
      case 'text':
        return this.renderText(event.delta);
      case 'tool_call':
        return this.renderToolCall(event.name, event.callId, event.args);
      case 'tool_result':
        return this.renderToolResult(event.name, event.callId, event.output);
      case 'reasoning':
        return this.renderReasoning(event.delta);
    }
  }

  private renderText(delta: string): void {
    this.streaming = true;
    process.stdout.write(delta);
  }

  private renderToolCall(name: string, callId: string, args: Record<string, unknown>): void {
    if (this.display.toolCalls === 'hidden') return;
    this.endStreaming();
    this.toolStart.set(callId, Date.now());

    const color = this.toolColors[name] ?? YELLOW;
    const formatter = this.formatters[name] ?? this.defaultFormatter;
    const argStr = formatter(name, args);

    if (this.display.toolCalls === 'verbose') {
      console.log(`  ${color}⚡${RESET} ${BOLD}${name}${RESET}`);
      for (const [k, v] of Object.entries(args)) {
        console.log(`    ${DIM}${k}: ${trunc(JSON.stringify(v), 80)}${RESET}`);
      }
    } else {
      console.log(`  ${color}⚡${RESET} ${DIM}${name}${argStr ? ' ' + argStr : ''}${RESET}`);
    }
  }

  private renderToolResult(name: string, callId: string, output: string): void {
    if (this.display.toolResults === 'hidden') return;
    const ms = Date.now() - (this.toolStart.get(callId) ?? Date.now());
    const dur = `(${(ms / 1000).toFixed(1)}s)`;

    if (this.display.toolResults === 'verbose') {
      console.log(`  ${GREEN}✓${RESET} ${DIM}${name} ${dur}${RESET}`);
      const lines = output.split('\n').slice(0, 10);
      for (const line of lines) {
        console.log(`    ${GRAY}${trunc(line, 80)}${RESET}`);
      }
      if (output.split('\n').length > 10) console.log(`    ${GRAY}…${RESET}`);
    } else {
      console.log(`  ${GREEN}✓${RESET} ${DIM}${name} ${dur}${RESET}`);
    }
  }

  private renderReasoning(delta: string): void {
    if (!this.display.reasoning) return;
    this.endStreaming();
    process.stdout.write(`${DIM}${delta}${RESET}`);
  }

  endStreaming(): void {
    if (this.streaming) {
      process.stdout.write(RESET + '\n');
      this.streaming = false;
    }
  }

  private defaultFormatter: ToolFormatter = (_name, args) => {
    const key = Object.keys(args)[0];
    if (!key) return '';
    return `${key}=${trunc(String(args[key]))}`;
  };
}
```

---

## Wire into cli.ts

Replace the inline `handleEvent` function in cli.ts with the renderer:

```typescript
import { TuiRenderer } from './renderer.js';

// In main(), before the readline loop:
const renderer = new TuiRenderer({ display: config.display });

// In the line handler, replace handleEvent:
const result = await runAgentWithRetry(config, trimmed, {
  onEvent: (e) => renderer.handle(e),
});
renderer.endStreaming();
```

---

## Customization

### Per-tool colors

Pass `toolColors` to highlight dangerous or special tools:

```typescript
const renderer = new TuiRenderer({
  display: config.display,
  toolColors: {
    shell: '\x1b[31m',      // red — destructive potential
    file_write: '\x1b[33m', // yellow — modifies files
    web_search: '\x1b[35m', // magenta — network call
  },
});
```

### Custom formatters

Override how arguments are summarized for any tool:

```typescript
const renderer = new TuiRenderer({
  display: config.display,
  toolFormatters: {
    shell: (_name, args) => {
      const cmd = String(args.command ?? '');
      return cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd;
    },
    grep: (_name, args) => `/${args.pattern}/ in ${args.path ?? '.'}`,
  },
});
```

### Display modes via config

Set in `agent.config.json`:

```json
{
  "display": {
    "toolCalls": "verbose",
    "toolResults": "verbose",
    "reasoning": true
  }
}
```

| Mode | `toolCalls` behavior | `toolResults` behavior |
|------|---------------------|----------------------|
| `compact` | One line: `⚡ name arg=value` | One line: `✓ name (0.3s)` |
| `verbose` | Name + all args on separate lines | Checkmark + first 10 lines of output |
| `hidden` | No output | No output |

---

## Adaptive Terminal Background

The input box background should adapt to any terminal color scheme. This module queries the terminal's actual background color and alpha-blends a subtle tint over it — the same technique Codex uses.

### src/terminal-bg.ts

```typescript
const FALLBACK = '\x1b[100m';

function blend(fg: [number, number, number], bg: [number, number, number], alpha: number): [number, number, number] {
  return [
    Math.round(fg[0] * alpha + bg[0] * (1 - alpha)),
    Math.round(fg[1] * alpha + bg[1] * (1 - alpha)),
    Math.round(fg[2] * alpha + bg[2] * (1 - alpha)),
  ];
}

function isLight(r: number, g: number, b: number): boolean {
  return 0.299 * r + 0.587 * g + 0.114 * b > 128;
}

function toAnsi(r: number, g: number, b: number): string {
  const ct = process.env.COLORTERM ?? '';
  if (ct.includes('truecolor') || ct.includes('24bit')) {
    return `\x1b[48;2;${r};${g};${b}m`;
  }
  // Approximate to xterm-256: indices 232-255 are grays, 16-231 are 6x6x6 cube
  const ri = Math.round(r / 255 * 5);
  const gi = Math.round(g / 255 * 5);
  const bi = Math.round(b / 255 * 5);
  return `\x1b[48;5;${16 + 36 * ri + 6 * gi + bi}m`;
}

function queryTerminalBg(timeoutMs = 200): Promise<[number, number, number] | null> {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) { resolve(null); return; }

    const timer = setTimeout(() => { cleanup(); resolve(null); }, timeoutMs);
    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();

    let buf = '';
    const onData = (data: Buffer) => {
      buf += data.toString();
      // Response: \x1b]11;rgb:RRRR/GGGG/BBBB\x1b\\ or \x07
      const match = buf.match(/\x1b\]11;rgb:([0-9a-fA-F]+)\/([0-9a-fA-F]+)\/([0-9a-fA-F]+)/);
      if (match) {
        cleanup();
        resolve([
          parseInt(match[1].slice(0, 2), 16),
          parseInt(match[2].slice(0, 2), 16),
          parseInt(match[3].slice(0, 2), 16),
        ]);
      }
    };

    function cleanup() {
      clearTimeout(timer);
      process.stdin.off('data', onData);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
    }

    process.stdin.on('data', onData);
    process.stdout.write('\x1b]11;?\x07');
  });
}

export async function detectBg(): Promise<string> {
  const bg = await queryTerminalBg();
  if (!bg) return FALLBACK;
  const [r, g, b] = bg;
  const [top, alpha]: [[number, number, number], number] = isLight(r, g, b)
    ? [[0, 0, 0], 0.04]
    : [[255, 255, 255], 0.12];
  const [br, bg2, bb] = blend(top, [r, g, b], alpha);
  return toAnsi(br, bg2, bb);
}
```

### How it works

1. **OSC 11 query**: Sends `\x1b]11;?\x07` to the terminal, which responds with its background RGB
2. **Light/dark detection**: Uses perceived luminance (`Y = 0.299R + 0.587G + 0.114B > 128`)
3. **Alpha blending**: Dark terminals get white at 12% opacity; light terminals get black at 4%
4. **Color downgrade**: Uses truecolor (`\x1b[48;2;r;g;bm`) when `COLORTERM` supports it, otherwise approximates to xterm-256 color cube
5. **Fallback**: If the terminal doesn't respond to OSC 11 within 200ms (piped stdin, tmux without passthrough, etc.), falls back to `\x1b[100m` (bright black — theme-defined)

### Wire into cli.ts

```typescript
import { detectBg } from './terminal-bg.js';

async function main() {
  const config = loadConfig();
  const BG_INPUT = await detectBg();
  // Use BG_INPUT for prompt and padding lines...
}
```

---

## Styled Input (Raw Mode)

Node's `readline` module cannot render content below the cursor reliably. For styled input mode, use raw stdin for full control.

### styledReadLine()

```typescript
const WHITE = '\x1b[97m';
const RESET = '\x1b[0m';

function styledReadLine(bg: string): Promise<string> {
  return new Promise((resolve) => {
    let line = '';
    let first = true;

    function draw() {
      if (first) {
        process.stdout.write(`\n${bg}\x1b[K${RESET}\n`);
        first = false;
      } else {
        process.stdout.write(`\r\x1b[2K`);
      }
      process.stdout.write(`${bg}\x1b[K ${WHITE}›${RESET}${bg}${WHITE} ${line}${RESET}`);
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
```

### How it works

1. **First draw**: writes top BG pad (`\n${bg}\x1b[K\n`) then prompt line — cursor stays on prompt
2. **Subsequent draws**: erases prompt line in-place (`\r\x1b[2K`), redraws with updated text. No cursor-up/down, no line creation — can't grow or shift
3. **On Enter**: `${RESET}\n` moves to next line. Main loop writes bottom BG pad + status line
4. **On Ctrl-C**: exits cleanly
5. **On Backspace**: removes last character and redraws in-place

### Wire into cli.ts

Use a loop instead of readline's event-based `on('line')`:

```typescript
async function getInput(): Promise<string> {
  if (styled) return styledReadLine(BG_INPUT);
  return new Promise((resolve) => { rl.prompt(); rl.once('line', resolve); });
}

async function loop() {
  while (true) {
    const input = await getInput();
    const trimmed = input.trim();
    if (!trimmed) continue;

    if (styled) {
      const cwd = process.cwd().replace(process.env.HOME ?? '', '~');
      process.stdout.write(`${BG_INPUT}\x1b[K${RESET}\n\x1b[K  ${DIM}${cwd}${RESET}\n`);
    }

    // ... handle input, run agent, etc.
  }
}
```

On submit, the handler writes: bottom BG pad (fills bleed line) → status line on default BG → newline. This produces symmetric scrollback: top pad | `› text` | bottom pad | `~/path` status.
