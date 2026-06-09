# Frontend repo structure

## TypeScript

Use TypeScript. Before writing a `tsconfig`, research current best practices for your stack (strict mode, module resolution, path aliases, project references). Don't copy a config blindly — understand what each option enforces.

## Tooling

- **ESLint** — set up with production-ready shared configs for your framework (e.g. `eslint-config-next`, `typescript-eslint`). Treat warnings as errors in CI.
- **Vite** — use for frontend bundling and dev server.

## Folder structure

Organize by **meaning**, not by technical type. Avoid top-level `hooks/`, `utils/`, `selectors/` folders that group unrelated code together.

Prefer **feature-based folders** — everything belonging to one domain lives together:

```
Timer/
├── TimerPage.tsx
├── UseTimerController.ts
├── Stats.ts
├── Stats.test.ts
└── Definitions.ts
```

Separate concerns at the domain level:

- **models** — types, schemas, constants, pure data transforms for a domain
- **components** — UI for a feature; split large components into subcomponents in the same folder
- **pages** — route-level shells that compose feature components (thin, no business logic)

Cross-cutting shared code (design-system primitives, generic helpers) gets its own place — but only when it's truly shared, not because "it's a hook".

**Split large files.** A 300-line component → subcomponents. Multiple unrelated helpers in one `Utils.ts` → one file per function or per concern (`RoundSolveSeconds.ts`, `FormatSolveTime.ts`). Same for selectors, hooks, formatters.

## Tests

Use Vitest (or equivalent). Don't test everything — focus on **utils and critical logic** where bugs are costly and behavior is non-obvious.

Prioritize **readability**: a test file should read like a spec of what the code does to data. Clear `describe`/`it` names, small factory helpers for test data, explicit edge-case examples. Tests are documentation — if they're hard to read, rewrite them.

## Pre-commit

Run typecheck, lint, and tests before merge (`codecheck` script). Hook it on the main branch if the team wants enforcement.
