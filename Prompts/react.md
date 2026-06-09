# React conventions

## Component structure

- Functional components and hooks only.
- Internal subcomponents: unexported functions in the same file. Export only the public surface.
- List items / expensive renders: wrap with `memo()` — define `function XxxComponent`, export `const Xxx = memo(XxxComponent)`.
- Constants used only inside a component: file-level `const`, not inside the function body.

## Server / client split (Next.js App Router)

- `"use client"` on any file using hooks, browser APIs, or event handlers.
- Route files (`app/**/page.tsx`): named function for logic, thin `export default` alias for the framework.
- Keep route files as shells — delegate to feature components in `components/`.

## Feature module layout

```
FeatureName/
├── FeatureName.tsx           # JSX only — receives a view-model, renders
├── UseFeatureController.ts   # composes hooks, returns derived view-model
├── UseFeatureX.ts            # one concern per hook file
├── Definitions.ts            # types, constants, enums for this feature
├── RoundSolveSeconds.ts      # one pure helper per file when possible
└── Stats.test.ts             # tests for pure logic in this feature
```

## Controller + small hooks pattern

For complex pages/features:

1. Split each concern into its own `useFeature*` hook (keyboard handling, data fetching, timers, etc.).
2. One **controller hook** composes them, owns shared refs/state, and returns a flat view-model for the component.
3. The component file stays thin — no business logic, just destructuring and JSX.

```ts
/**
 * Page state + input wiring. Each concern lives in a `useTimer*` hook beside this file;
 * this module only composes them and exposes the derived view-model.
 */
export function useTimerPageController() { /* compose hooks, return view-model */ }
```

Add a one-line JSDoc on controller and non-obvious hooks.

## Props & callbacks

- `interface XxxProps` with explicit callback names: `onClick`, `onToggleReverse`, `onOpenChange`.
- Pass `RefObject` down when child needs to coordinate with parent timing (e.g. click-guard refs).
- Prefer `useCallback` for callbacks passed to memoized children.

## SSR-safe persisted state

Never read localStorage/IndexedDB/persistent atoms directly in render — causes hydration mismatch.

Pattern: subscribe to the atom, return a **fallback** until `useEffect` marks hydrated:

```ts
export function useHydratedPersistentValue<T>(atom: WritableAtom<T>, fallback: T): T {
  const stored = useStore(atom);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  return hydrated ? stored : fallback;
}
```

Provide typed variants per value shape (boolean, string[], number[]) rather than one generic hook with loose typing.

## Performance defaults

- Defer expensive mounts (canvas, charts) until in-viewport when the list can be long.
- Cap device pixel ratio for small previews.
- `useMemo` for non-trivial derived data (parsed notation, filtered lists) — not for every variable.

## Provider hierarchy

Keep providers in `app/layout.tsx` (or a single `Providers.tsx`). Nest theme → app-specific context → children. Custom theme provider should sync with a blocking inline script to avoid flash.

## What not to do

- Don't put business logic in JSX or inline arrow functions that duplicate controller logic.
- Don't create one 300-line hook — split by concern.
- Don't import UI libraries into shared/core packages; enforce with ESLint `no-restricted-imports` if needed.
