import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

function workspacePath(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url));
}

export default defineConfig({
  resolve: {
    alias: {
      '@talentmatch/config': workspacePath('./packages/config/src/index.ts'),
      '@talentmatch/logger': workspacePath('./packages/logger/src/index.ts'),
      '@talentmatch/shared': workspacePath('./packages/shared/src/index.ts'),
      '@talentmatch/validation': workspacePath('./packages/validation/src/index.ts'),
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
    },
    include: ['**/*.test.ts'],
  },
});
