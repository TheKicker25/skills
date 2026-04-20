import { fileReadTool } from './file-read.js';
import { fileWriteTool } from './file-write.js';
import { fileEditTool } from './file-edit.js';
import { globTool } from './glob.js';
import { grepTool } from './grep.js';
import { listDirTool } from './list-dir.js';
import { shellTool } from './shell.js';

// User-defined tools executed client-side
export const tools = [
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  globTool,
  grepTool,
  listDirTool,
  shellTool,
];

// OpenRouter server tools — executed server-side, no implementation needed.
// Pass these alongside user-defined tools in the callModel request.
// Note: server tool objects have a different shape from user-defined tools,
// so they are kept separate and spread into the tools array at call time.
export const serverTools: Array<{ type: string }> = [
  { type: 'openrouter:web_search' },
  { type: 'openrouter:datetime' },
];
