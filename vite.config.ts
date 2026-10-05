import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [tailwindcss(), svelte()],
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
