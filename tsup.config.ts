import { defineConfig } from 'tsup';

export default defineConfig({
  target: 'esnext',
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
      target: 'ES2020',
      module: 'ESNext',
    },
  },
  // Additional options to ensure JSDoc preservation
  treeshake: false,
  minify: false,
});
