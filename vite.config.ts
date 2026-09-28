import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const brand = JSON.parse(readFileSync(resolve(__dirname, 'brand.json'), 'utf8')) as { name: string };

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'inject-brand',
      transformIndexHtml: (html: string) => html.replaceAll('%APP_NAME%', () => brand.name),
    },
  ],
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: resolve(__dirname, 'src/$1') },
    ],
  },
});
