import { defineConfig } from 'tsup';

export default defineConfig({
  // Aligned with tsconfig.json `target` (ES2021).
  target: 'es2021',
  // Multi-entry: the back-compat root (`.`) plus the tiered subpath entry
  // points `@mutinex/cloud-infra/org` and `@mutinex/cloud-infra/advanced`.
  // The `index` entry is emitted byte-for-byte as before (same key → same
  // `dist/index.*` filenames); `org`/`advanced` are purely additive.
  entry: {
    index: 'src/index.ts',
    org: 'src/org.ts',
    advanced: 'src/advanced.ts',
  },
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
