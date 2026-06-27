import { defineConfig } from 'tsup';

export default defineConfig({
  // Aligned with tsconfig.json `target` (ES2021).
  target: 'es2021',
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: {
    // Preserve JSDoc comments in the generated type definitions
    compilerOptions: {
      removeComments: false,
      declaration: true,
      declarationMap: true,
      emitDeclarationOnly: true,
      strict: true,
      skipLibCheck: true,
      moduleResolution: 'node',
      target: 'ES2021',
      module: 'ESNext',
    },
  },
  // Additional options to ensure JSDoc preservation
  treeshake: false,
  minify: false,
});
