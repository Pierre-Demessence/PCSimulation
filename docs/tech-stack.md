# Tech stack

- **Language:** TypeScript, strict, with `erasableSyntaxOnly` and
  `verbatimModuleSyntax` — no enums, no constructor parameter properties, and
  type-only imports must be `import type`.
- **Build / dev server:** Vite 8 with `@vitejs/plugin-react` (JSX compiled for
  React 19) and `@tailwindcss/vite` (Tailwind CSS v4). `jsx: react-jsx` +
  `jsxImportSource: react` in `tsconfig.json`, mirrored by the React plugin in
  `vite.config.ts` and `vitest.config.ts`.
- **Testing:** Vitest 4 in a `jsdom` environment, with `@testing-library/react`
  and `@testing-library/jest-dom` (loaded via `vitest.setup.ts`). Tests live next
  to source as `*.test.ts` / `*.test.tsx`. Scripts: `npm test` /
  `npm run test:watch` / `npm run test:coverage`.
- **Linting:** ESLint flat config via `@antfu/eslint-config` (TS config loaded
  with `jiti`), including perfectionist key and import sorting. Scripts:
  `npm run lint` / `npm run lint:fix`.
- **Path alias:** `@/*` → `src/*` (kept in sync across `tsconfig.json`,
  `vite.config.ts`, and `vitest.config.ts`).
- **Runtime dependencies:** `react` + `react-dom` for the interface, `three` for
  the 3D model view. The UI is built with Tailwind CSS v4 and **shadcn/ui**
  (Radix-based primitives added as source under `src/components/ui`), themed dark
  by default, with **IBM Plex Sans** (variable) and **IBM Plex Mono** self-hosted
  through `@fontsource`. The simulation itself is plain TypeScript; the board
  views use Canvas 2D and three.js. Three.js is loaded only by the visualisation,
  so it is tree-shaken out until that panel is on screen.
- **Branding:** the `name` in `brand.json` is injected into `index.html` via the
  `%APP_NAME%` placeholder at build time.
- **Package manager:** npm.
- **Minimum Node:** 20.19+ or 22.12+ (`engines` and CI agree).
