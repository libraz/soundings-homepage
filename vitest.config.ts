import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // A component test opts into a DOM per file with a
    // `// @vitest-environment happy-dom` comment at the top of that file —
    // not jsdom: jsdom 30 installs its own realm's `Uint8Array`, which fails
    // esbuild's identity check and stops the suite before a test runs.
    // Everything else keeps the cheaper node environment.
    environment: 'node',
    // Registers the vitepress and useArchive mocks before a test file's own
    // imports run, so `tests/mount.ts` needs no per-file `vi.mock` boilerplate.
    setupFiles: ['./tests/mount.ts'],
    include: ['tests/**/*.test.ts'],
  },
});
