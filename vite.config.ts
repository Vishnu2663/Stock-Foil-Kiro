import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Writes assets-manifest.json so the service worker can pre-cache every chunk (all pages work offline). */
function assetManifest(): Plugin {
  return {
    name: 'sf-asset-manifest',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => f.startsWith('assets/')).map((f) => './' + f);
      this.emitFile({ type: 'asset', fileName: 'assets-manifest.json', source: JSON.stringify(files) });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), assetManifest()],
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    passWithNoTests: false,
    testTimeout: 900_000,
  },
});
