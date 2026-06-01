import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const appPackageJsonPath = fileURLToPath(new URL('./package.json', import.meta.url));
const appPackageJson = JSON.parse(fs.readFileSync(appPackageJsonPath, 'utf8')) as {
  version?: string;
};
const appVersion = appPackageJson.version ?? '0.0.0';
const builtAt = new Date().toISOString();
const buildId = `${appVersion}-${builtAt}`;

function versionManifestPlugin(): Plugin {
  return {
    name: 'tradepilot-version-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(
          {
            version: appVersion,
            buildId,
            builtAt,
          },
          null,
          2,
        ),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versionManifestPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD_ID__: JSON.stringify(buildId),
    __APP_BUILT_AT__: JSON.stringify(builtAt),
  },
  resolve: {
    alias: {
      '@tradepilot/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
      '@tradepilot/config': fileURLToPath(
        new URL('../../packages/config/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const extension = path.extname(assetInfo.name ?? '');
          if (extension === '.json' && assetInfo.name === 'version.json') {
            return '[name][extname]';
          }

          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
});
