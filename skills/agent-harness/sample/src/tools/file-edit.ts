import { tool } from '@openrouter/agent/tool';
import { z } from 'zod';
import { readFile, writeFile } from 'fs/promises';

export const fileEditTool = tool({
  name: 'file_edit',
  description: 'Apply search-and-replace edits to a file with diff output',
  inputSchema: z.object({
    path: z.string().describe('Absolute path to the file'),
    edits: z.array(
      z.object({
        old_text: z.string().describe('Exact text to find'),
        new_text: z.string().describe('Replacement text'),
      }),
    ).describe('Array of search-and-replace edits'),
  }),
  execute: async ({ path, edits }) => {
    try {
      let content = await readFile(path, 'utf-8');
      const original = content;

      for (const edit of edits) {
        const count = content.split(edit.old_text).length - 1;
        if (count === 0) {
          return { error: `old_text not found in ${path}: "${edit.old_text.slice(0, 80)}..."` };
        }
        if (count > 1) {
          return { error: `old_text is ambiguous (${count} matches) in ${path}: "${edit.old_text.slice(0, 80)}..."` };
        }
        content = content.replace(edit.old_text, edit.new_text);
      }

      await writeFile(path, content, 'utf-8');

      // Generate a simple unified diff
      const oldLines = original.split('\n');
      const newLines = content.split('\n');
      const diff: string[] = [`--- ${path}`, `+++ ${path}`];

      let i = 0;
      let j = 0;
      while (i < oldLines.length || j < newLines.length) {
        if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
          i++;
          j++;
        } else {
          const hunkStart = Math.max(0, i - 2);
          const contextBefore = oldLines.slice(hunkStart, i).map((l) => ` ${l}`);
          diff.push(`@@ -${i + 1} +${j + 1} @@`);
          diff.push(...contextBefore);

          while (i < oldLines.length && (j >= newLines.length || oldLines[i] !== newLines[j])) {
            diff.push(`-${oldLines[i]}`);
            i++;
          }
          while (j < newLines.length && (i >= oldLines.length || oldLines[i] !== newLines[j])) {
            diff.push(`+${newLines[j]}`);
            j++;
          }

          const contextAfter = oldLines.slice(i, Math.min(oldLines.length, i + 2)).map((l) => ` ${l}`);
          diff.push(...contextAfter);
        }
      }

      return { edited: true, path, diff: diff.join('\n') };
    } catch (err: any) {
      if (err.code === 'ENOENT') return { error: `File not found: ${path}` };
      return { error: err.message };
    }
  },
});
