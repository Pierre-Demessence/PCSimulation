# Tech stack

- **Language:** TypeScript, strict, with `erasableSyntaxOnly` and
  `verbatimModuleSyntax` — no enums, no constructor parameter properties, and
  type-only imports must be `import type`.
- **Build / dev server:** Vite 8.
- **Testing:** Vitest 4 in a `jsdom` environment. Tests live next to source as
  `*.test.ts`. Scripts: `npm test` / `npm run test:watch` /
  `npm run test:coverage`.
- **Linting:** ESLint flat config via `@antfu/eslint-config` (TS config loaded
  with `jiti`), including perfectionist key and import sorting. Scripts:
  `npm run lint` / `npm run lint:fix`.
- **Path alias:** `@/*` → `src/*` (kept in sync across `tsconfig.json`,
  `vite.config.ts`, and `vitest.config.ts`).
- **Runtime dependencies:** `three` only, and only for the 3D model view. The
  simulation is plain TypeScript; the flat views use the DOM and Canvas 2D.
  Three.js is most of the production bundle (about 157 kB gzipped), which is the
  price of the third dimension. Loading it lazily is a candidate if the first
  paint ever matters more than the model.
- **Branding:** the `name` in `brand.json` is injected into `index.html` via the
  `%APP_NAME%` placeholder at build time.
- **Package manager:** npm.
- **Minimum Node:** 20.19+ or 22.12+ (`engines` and CI agree).
