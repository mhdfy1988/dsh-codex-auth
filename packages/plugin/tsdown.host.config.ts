import { defineConfig } from 'tsdown'

/** Bundle the Host plugin after the build script emits strict Typert artifacts. */
export default defineConfig({
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  deps: {
    neverBundle: (specifier: string) => specifier.startsWith('@deepseek-ai/') || specifier === 'zod',
  },
})
