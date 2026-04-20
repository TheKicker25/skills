import { tool } from '@openrouter/agent/tool';
import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { resolve } from 'path';

const execFileAsync = promisify(execFile);

export const grepTool = tool({
  name: 'grep',
  description: 'Search file contents by regex pattern',
  inputSchema: z.object({
    pattern: z.string().describe('Regex pattern to search for'),
    path: z.string().optional().describe('Directory or file to search (default: cwd)'),
    glob: z.string().optional().describe('File filter, e.g. "*.ts"'),
    ignoreCase: z.boolean().optional().describe('Case-insensitive search'),
  }),
  execute: async ({ pattern, path, glob: fileGlob, ignoreCase }) => {
    try {
      const searchPath = path ? resolve(path) : process.cwd();
      const args = ['--json', '--max-count=100'];

      if (ignoreCase) args.push('--ignore-case');
      if (fileGlob) args.push('--glob', fileGlob);
      args.push(pattern, searchPath);

      try {
        const { stdout } = await execFileAsync('rg', args, {
          maxBuffer: 256 * 1024,
          timeout: 30000,
        });

        const matches: Array<{ file: string; line: number; content: string }> = [];
        for (const line of stdout.split('\n').filter(Boolean)) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === 'match') {
              matches.push({
                file: parsed.data.path.text,
                line: parsed.data.line_number,
                content: parsed.data.lines.text.trimEnd(),
              });
            }
          } catch {
            // skip malformed lines
          }
        }

        return {
          matches: matches.slice(0, 100),
          count: matches.length,
          ...(matches.length >= 100 && { truncated: true }),
        };
      } catch (rgErr: any) {
        // ripgrep not found or no matches (exit code 1)
        if (rgErr.code === 'ENOENT' || rgErr.status === 1) {
          // Fallback: return empty or note that rg is not installed
          return { matches: [], count: 0, note: 'ripgrep (rg) not found or no matches' };
        }
        return { error: rgErr.message };
      }
    } catch (err: any) {
      return { error: err.message };
    }
  },
});
