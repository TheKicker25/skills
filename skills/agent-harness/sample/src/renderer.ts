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
    if (!this.streaming) {
      this.streaming = true;
      process.stdout.write(CYAN);
    }
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
