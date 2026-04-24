# TUI Input Box Test Plan

Run these tests via ttyd + Playwright to verify the styled input box renders correctly.

## Setup

```bash
cd skills/create-agent-tui/sample
ttyd -p 7682 --writable npx tsx src/cli.ts &
# Navigate Playwright to http://localhost:7682
# Wait 5s for CLI to load
```

## Test Cases

### T1: Initial render — 3-line box visible
- **Action**: App starts, no typing yet
- **Expect**: Top BG pad + `› ` prompt + bottom BG pad (3 gray lines visible)
- **Screenshot**: initial state

### T2: Typing does not grow or shift the box
- **Action**: Type "hello world" one character at a time
- **Expect**: Box stays exactly 3 lines. Text appears after `›`. No upward shift, no extra lines.
- **Screenshot**: after typing 5 chars, after typing 10 chars

### T3: Backspace works
- **Action**: Press Backspace 3 times
- **Expect**: Last 3 characters removed, box stays 3 lines, no visual artifacts
- **Screenshot**: after backspace

### T4: Submit shows symmetric box + status line
- **Action**: Press Enter
- **Expect**: Submitted block in scrollback: top BG pad + `› hello wo` + bottom BG pad + status line (dim cwd, default BG). Response appears below.
- **Screenshot**: after submit + response

### T5: Second prompt renders correctly
- **Action**: After response, new prompt appears
- **Expect**: New 3-line box (top pad + prompt + bottom pad). No artifacts from previous block.
- **Screenshot**: second prompt

### T6: Bottom-of-screen — no cutoff
- **Action**: Resize to small terminal (300px height). Submit multiple messages.
- **Expect**: Prompt box is fully visible at bottom. No lines cut off.
- **Screenshot**: small terminal after 2 submits

### T7: Ctrl+C exits cleanly
- **Action**: Press Ctrl+C
- **Expect**: Process exits, terminal restored to normal

## Cleanup

```bash
pkill -f 'ttyd.*7682'
```
