import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import { injectSeoTags, renderSitemap } from './src/seo/head-tags';
import { SEO_ROUTES } from './src/seo/routes';

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

/*
  The app is client-rendered, so social crawlers and any bot that does not run JS
  only ever see index.html. This writes a real HTML file per public route with
  that route's title, description, canonical, OG/Twitter tags and JSON-LD, so the
  correct metadata is in the initial response instead of being set after hydration.
*/
function seoPlugin(): Plugin {
  const homeRoute = SEO_ROUTES.find((route) => route.path === '/');
  let outDir = 'dist';

  return {
    name: 'tradepilot-seo',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    transformIndexHtml(html) {
      return homeRoute ? injectSeoTags(html, homeRoute) : html;
    },
    closeBundle() {
      const indexPath = path.join(outDir, 'index.html');
      if (!fs.existsSync(indexPath)) {
        return;
      }

      const html = fs.readFileSync(indexPath, 'utf8');

      for (const route of SEO_ROUTES) {
        if (route.path === '/') {
          continue;
        }

        const slug = route.path.replace(/^\//, '');
        const routeHtml = injectSeoTags(html, route);

        /*
          Two copies per route because static servers disagree on how they resolve
          an extensionless path: some look for <slug>/index.html, others for
          <slug>.html. Writing both means the route keeps its own metadata either
          way, instead of silently falling back to the home page's tags.
        */
        const routeDir = path.join(outDir, slug);
        fs.mkdirSync(routeDir, { recursive: true });
        fs.writeFileSync(path.join(routeDir, 'index.html'), routeHtml, 'utf8');
        fs.writeFileSync(path.join(outDir, `${slug}.html`), routeHtml, 'utf8');
      }

      const lastModified = builtAt.slice(0, 10);
      fs.writeFileSync(path.join(outDir, 'sitemap.xml'), renderSitemap(lastModified), 'utf8');
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versionManifestPlugin(), seoPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD_ID__: JSON.stringify(buildId),
    __APP_BUILT_AT__: JSON.stringify(builtAt),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
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
