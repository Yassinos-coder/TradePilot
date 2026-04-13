import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@tradepilot/shared': fileURLToPath(
        new URL('../../packages/shared/dist/index.mjs', import.meta.url),
      ),
      '@tradepilot/config': fileURLToPath(
        new URL('../../packages/config/dist/index.mjs', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
  },
});
