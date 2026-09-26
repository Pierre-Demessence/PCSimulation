# AGENTS.md

Agent operating notes for **PC Simulation**.
See [docs/INDEX.md](docs/INDEX.md) and [docs/agent/README.md](docs/agent/README.md).

## Workflow

- Prefer TypeScript; import via the `@/` alias.
- Co-locate tests as `*.test.ts`.
- Run lint + test + build before marking work complete.
- Keep `docs/` current when behavior changes; record non-trivial work under
  `docs/plans/`.
