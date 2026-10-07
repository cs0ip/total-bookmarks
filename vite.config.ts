import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [tailwindcss(), svelte(), {
    name: 'extension-locales',
    buildStart() {
      for (const language of ['en', 'ru', 'zh']) this.addWatchFile(resolve(import.meta.dirname, `src/locales/${language}.json`));
    },
    generateBundle() {
      // Generate Firefox metadata from the same dictionaries as the page UI.
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
    outDir: 'dist',
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        background: resolve(import.meta.dirname, 'src/background.ts')
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'
      }
    }
  }
});
