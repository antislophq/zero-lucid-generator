import { build } from 'tsup'

await build({
  entry: {
    index: 'src/index.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm'],
  target: 'node18',
  dts: {
    // tsup hard-codes baseUrl internally (issue egoist/tsup#1388),
    // which triggers TS5101 under TypeScript 6. Pass the flag directly
    // into the DTS worker's compiler options so it is silenced there.
    compilerOptions: {
      ignoreDeprecations: '6.0',
    },
  },
  clean: true,
  sourcemap: false,
  banner: {
    js: '',
  },
})
