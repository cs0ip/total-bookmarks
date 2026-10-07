import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { createManifest, type BrowserTarget } from './build/manifest.ts';

export default defineConfig(({ mode }) => {
  if (!['firefox', 'chrome', 'production', 'development'].includes(mode)) throw new Error(`Unknown browser build mode: ${mode}`);
  const target: BrowserTarget = mode === 'chrome' ? 'chrome' : 'firefox';
  return {
    base: './',
    define: { __BROWSER_TARGET__: JSON.stringify(target) },
    resolve: {
      alias: {
        '@platform/icons': resolve(import.meta.dirname, `src/platform/${target}/icons.ts`),
        '@platform/background': resolve(import.meta.dirname, `src/platform/${target}/background.ts`)
      }
    },
    plugins: [tailwindcss(), svelte(), {
      name: 'extension-metadata',
      buildStart() {
        this.addWatchFile(resolve(import.meta.dirname, 'LICENSE'));
        this.addWatchFile(resolve(import.meta.dirname, 'build/manifest.firefox.json'));
        for (const language of ['en', 'ru', 'zh']) this.addWatchFile(resolve(import.meta.dirname, `src/locales/${language}.json`));
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'LICENSE', source: readFileSync(resolve(import.meta.dirname, 'LICENSE'), 'utf8') });
        this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(createManifest(target), null, 2) });
        for (const language of ['en', 'ru', 'zh']) {
          const messages = JSON.parse(readFileSync(resolve(import.meta.dirname, `src/locales/${language}.json`), 'utf8'));
          this.emitFile({
            type: 'asset',
            fileName: `_locales/${language === 'zh' ? 'zh_CN' : language}/messages.json`,
            source: JSON.stringify({
              extensionDescription: { message: messages.extensionDescription },
              openManager: { message: messages.openManager }
            })
          });
        }
      }
    }],
    build: {
      outDir: `dist/${target}`,
      rolldownOptions: {
        input: {
          main: resolve(import.meta.dirname, 'index.html'),
          background: resolve(import.meta.dirname, 'src/background.ts')
        },
        output: {
          entryFileNames: (chunk) => chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'
        }
      }
    }
  };
});
