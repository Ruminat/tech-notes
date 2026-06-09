# Frontend TypeScript conventions

## Exports & imports

- Named exports only. No barrel files (`index.ts` re-exporting siblings). Import from concrete file paths.
- `import type` for type-only imports (`verbatimModuleSyntax` is on).
- Path alias (`@/`) for app-internal imports. Library consumers import only through declared public entry points, never deep paths.

## TypeScript strictness

Root `tsconfig` baseline — extend it, don't weaken it:

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`
- `isolatedModules`, `moduleResolution: "bundler"`, `forceConsistentCasingInFileNames`

Treat `T | undefined` from index access and optional props as real — narrow before use. Don't assign `{ x: undefined }` to `{ x?: string }`.

## Types & validation

- Domain types in dedicated files (`types/`, or feature-local `Definitions.ts`). Union literals over loose `string` for enums.
- Props: `interface XxxProps` at top of file, exported only when reused.
- Runtime validation (Valibot/Zod) for anything persisted or deserialized — schema lives next to the atom/store that uses it.

## File naming

PascalCase for all files and folders (`TimerPage/TimerPage.tsx`, `UseMediaQuery.ts`, `AlgorithmGallery.tsx`, `OllAlgs.ts`). Tests: co-located `*.test.ts` beside the source file (`Stats.test.ts`).

## Testing

Vitest, `environment: "node"`. Test **pure functions only** — parsing, transforms, stats, validation. No DOM/component rendering tests unless explicitly requested.

- Co-locate tests beside source.
- Local factory helpers (`makeSolve()`) for test data.
- Name edge-case tests explicitly ("returns safe defaults for an empty list").

## State layers

| Concern | Tool |
|---------|------|
| Ephemeral UI | `useState` / `useRef` |
| Cross-session prefs | persistent atoms (nanostores or equivalent) |
| Large structured data | IndexedDB wrapper (idb-keyval or equivalent) |
| Derived values | `useMemo` / plain functions |

Don't reach for global state libraries when local state + small persistent atoms suffice.

## Styling (when applicable)

- Utility classes for layout/spacing; CSS variables for design tokens.
- SCSS modules for component-specific layout that utilities can't express cleanly.
- `cn()` (clsx + tailwind-merge) for conditional class merging.

## CI gate

`codecheck` = `typecheck && lint && test`. Lint runs with `--max-warnings=0`.
