import { tool } from '@openrouter/agent/tool';
import { z } from 'zod';
import { glob as fsGlob } from 'fs/promises';
import { resolve } from 'path';

export const globTool = tool({
  name: 'glob',
  description: 'Find files by glob pattern',
  inputSchema: z.object({
    pattern: z.string().describe('Glob pattern, e.g. "src/**/*.ts"'),
    path: z.string().optional().describe('Directory to search in (default: cwd)'),
  }),
  execute: async ({ pattern, path }) => {
    try {
      const cwd = path ? resolve(path) : process.cwd();
      const results: string[] = [];

      for await (const entry of fsGlob(pattern, { cwd })) {
        results.push(entry);
        if (results.length >= 1000) break;
      }

      results.sort();
      return {
        files: results,
        count: results.length,
        ...(results.length >= 1000 && { truncated: true }),
      };
    } catch (err: any) {
      return { error: err.message };
    }
  },
});
