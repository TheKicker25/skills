import { tool } from '@openrouter/agent/tool';
import { z } from 'zod';
import { readdir } from 'fs/promises';
import { resolve } from 'path';

export const listDirTool = tool({
  name: 'list_dir',
  description: 'List directory contents',
  inputSchema: z.object({
    path: z.string().optional().describe('Directory path (default: cwd)'),
  }),
  execute: async ({ path }) => {
    try {
      const dirPath = path ? resolve(path) : process.cwd();
      const entries = await readdir(dirPath, { withFileTypes: true });

      entries.sort((a, b) => a.name.localeCompare(b.name));

      const results = entries.slice(0, 500).map((entry) => ({
        name: entry.isDirectory() ? `${entry.name}/` : entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
      }));

      return {
        entries: results,
        count: results.length,
        ...(entries.length > 500 && { truncated: true }),
      };
    } catch (err: any) {
      if (err.code === 'ENOENT') return { error: `Directory not found: ${path}` };
      if (err.code === 'EACCES') return { error: `Permission denied: ${path}` };
      return { error: err.message };
    }
  },
});
