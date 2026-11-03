---
name: ask-codex-for-review
description: Have OpenAI Codex CLI review this conversation's work, then evaluate and fix the findings. Use on /ask-codex-for-review or when asked to have Codex review, re-review after fixes, or continue a Codex review thread. Supports a path scope, --fresh, and --review-only.
---

# ask-codex-for-review

Codex runs **read-only** via its own CLI auth (no API key, no file writes); you
independently validate and fix its findings. Review **history** is stored per repo +
branch + named thread, so repeat invocations continue the same review thread.

The script does the mechanical Codex work; you do the reasoning — scope, prompt,
evaluation, fixes.

`SCRIPT` = `~/.claude/skills/ask-codex-for-review/scripts/codex-review.mjs`
Run it with `node "$SCRIPT" <subcommand> ...`. Each run prints one JSON object on
stdout — parse it. Progress goes to stderr.

## Arguments

Parse `$ARGUMENTS`:
- a path (e.g. `src/components/Editor`) → review scope hint, pass as `--scope <path>`.
- `--fresh` → start a new review thread (new Codex session).
- `--review-only` → run the review and report, but do **not** auto-fix.
- `--thread <name>` → explicit thread name (default `default`).

## Step 1 — Preflight

Run `node "$SCRIPT" doctor`. If `ok` is false:
- codex missing → tell the user to install Codex CLI (`codex --version`) and stop.
- not logged in → tell them to run `codex login` and stop.
Do not try to work around auth.

## Step 2 — Thread state

Run `node "$SCRIPT" status` (add `--thread <name>` if given). Note `exists`,
`iteration`, and `lastReview`. `exists:true` means a resumable session is on file
→ this is an **iterative** review. `--fresh` forces a new thread regardless.

## Step 3 — Determine review scope

See what changed: `git status --porcelain`, `git diff` (unstaged), `git diff --cached`
(staged), and committed-vs-baseline (`git diff <merge-base>..HEAD`). Or run
`node "$SCRIPT" snapshot --max-bytes 1` for a cheap listing — its `files` and
`baseline` tell you what changed.

Combine that with what you know from this conversation; if a path arg was given,
restrict the scope to it. Decide the concrete scope = the files/commits that make
up the work you did this conversation. If you cannot infer it, fall back to all
changes reported (committed-vs-baseline + staged + unstaged) and say so. Never
silently review unrelated local changes.

## Step 4 — Build the review prompt

Write a prompt file to a temp path (e.g. `/tmp/codex-review-prompt-<ts>.md`).
Keep it concise — context, not a conversation dump. Codex reads the repo itself,
so describe intent and point it at the code.

Include:
- **Role**: strict, independent senior engineer doing a read-only review. You are
  sandboxed read-only; do not attempt to modify files.
- **Original request & requirements**: what the user asked for; expected behavior.
- **Design decisions & constraints / trade-offs** worth knowing.
- **Scope**: exact files / commits / diff range to focus on, and how to see them.
- **What to look for**: correctness, edge cases, races, async/await, state, React
  lifecycle, hook deps / stale closures, TS type safety, perf, memory leaks,
  security, error handling, API-contract and backward-compat breaks,
  maintainability with real consequences.
- **What to ignore**: nitpicks, style, anything a linter/formatter enforces,
  speculative issues without evidence, rewriting valid code by preference.
- **Output format**: a short summary line, then one block per finding with:
  `ID` (stable, e.g. R1), `Severity` (blocker/major/minor/nit), `Confidence`
  (high/med/low), `File:line`, `Problem`, `Failure scenario` (concrete inputs →
  wrong result), `Suggested fix`. End with an explicit verdict
  (APPROVE / APPROVE WITH NITS / REQUEST CHANGES). If nothing is wrong, say so.

If `status.exists` is true (iterative review), add a **feedback** section first:
for each previous finding, state what you did — Fixed (how), Rejected (why, with
evidence), or Deferred. Ask Codex to verify the previous findings against the
updated code, avoid repeating resolved ones unless it can show they persist, and
find anything new or newly introduced. (Read the stored `lastReview` file
referenced by `status` if you need the exact prior text.)

## Step 5 — Run Codex

```
node "$SCRIPT" run --prompt-file <file> [--thread <name>] [--fresh] [--scope <path>] [--timeout 600]
```
For a Git repo the script uses `codex exec review` (diff-based, read-only). The
**scope lives in your prompt prose** (Step 4). Each run is a fresh Codex session;
cross-iteration continuity comes from the feedback section you wrote. Optional
native persistent sessions
(`codex exec resume`) are **off by default** (`CODEX_REVIEW_NATIVE_RESUME=1`); the
script falls back automatically otherwise. Surface any `warnings` to the user.

Parse the JSON result. If `ok` is false or `reviewText` is empty, report the
failure using `warnings`, `exitCode`, `timedOut`, and the `stderrFile` path; do
not invent findings. The full review is in `reviewText` (also saved to
`reviewFile`). A transient "review was interrupted" is retried once automatically.

## Step 6 — Evaluate and fix (skip fixes if --review-only)

For each finding, independently:
1. Open the referenced code and judge whether it is real and in scope.
2. Check whether it is already handled.
3. Fix confirmed, in-scope issues, preserving existing architecture and
   conventions. Do not touch unrelated files. Do not commit or push.
4. Reject false positives with a concrete technical reason.
5. Run the relevant tests / typecheck / lint for what you changed.

Do one review + one remediation pass. Do not loop automatically — a further
review happens only on the next `/ask-codex-for-review`.

## Step 7 — Record resolutions

Write a short per-finding resolution summary (R1: fixed … / R2: rejected because …)
to a temp file and run:
```
node "$SCRIPT" record --resolutions-file <file> [--thread <name>]
```
(`--note "<text>"` works for short notes; `--data-file <json>` stores structured
findings). This persists your decisions so the next iteration has them.

## Step 8 — Report

Give a concise summary: scope reviewed, mode (created/resumed/fallback) +
iteration, each finding with severity and your verdict (fixed / rejected + why /
deferred), checks you ran and their result, and what remains. Mention that the
next `/ask-codex-for-review` will continue this thread. Never claim a check
passed unless you ran it.

## Notes
- History and raw logs live under `~/.claude/codex-review/` (override with
  `$CODEX_REVIEW_HOME`), outside any tracked repo. History is bounded.
- Threads are keyed by Git root + branch + thread name, so different
  branches/worktrees/features never share a Codex session. VCS detection + change
  listing live in the shared `scripts/vc-adapter.mjs`, used by `/review-ultra` too.
- The script never modifies `~/.codex/config.toml`. The `review` engine is
  read-only by construction; the opt-in native-resume path additionally passes
  `-c sandbox_mode="read-only"`.
