---
name: mock-it
description: Temporarily mock a hard-to-reach UI state in code, screenshot / visually check it, then delete the mock. Trigger on "mock it", "fake this state", "force this state in code".
---

# mock-it

If the UI state you need isn't reachable through real data/permissions/backend — **mock it directly in code**, take the shot, **delete the mock**.

Typical cases: a menu item visible only with edit rights; a specific backend response; error / empty / loading states; a feature flag; rare edge-case data.

## How

1. **Find what controls the state** — the condition, prop, hook, selector, or API response behind what you want to show.
2. **Mock only the state you need:**
   - flag/condition: `const canEdit = true;` instead of the real computation;
   - prop/value: hardcode what you need;
   - hook/selector: return a fixture instead of real data;
   - render branch: temporarily drop the gate (`&&`, early-return, permission check).
   Reload the page — the hot-reload dev server picks up the edit.
3. **Take the shot / check visually.**
4. **Delete the mock — immediately.** Revert the file: `git checkout -- <path>` (or restore it by hand).
5. **Confirm it's clean:** `git status --short` and `git diff -- <path>` must be empty for the mock files. The mock is **never** committed or pushed.

## Rules

- One mock at a time: mock → shoot → revert, then the next one.
- After reverting, make sure the app still builds. If the dev server shows a **false** "Module not found" for a file that exists, that's a stale build cache, not your mock: clear the build cache and restart the dev server.
