---
name: review-ultra
description: Dual-model independent code review of the current task — an isolated Claude reviewer subagent AND OpenAI Codex (persistent read-only session) review the same prepared change snapshot in parallel, then the main session consolidates, validates, and fixes confirmed issues. Use when the user types /review-ultra, or asks for a thorough/dual/ultra review of their changes. Supports --review-only (no fixes), --fresh (new review thread) and a path scope.
---

# review-ultra

Two independent reviewers inspect the SAME prepared change snapshot, then you (the
main session) consolidate and fix.

- **Claude Reviewer** — an isolated subagent (Agent tool), read-only, fresh context.
- **Codex Reviewer** — `codex-review.mjs` run in a persistent, read-only Codex session.
- **Orchestrator** — you: consolidate, validate, fix, report. Run ONE review pass
  per reviewer and ONE remediation pass. Do not loop.

`SCRIPTS` = `~/.claude/skills/ask-codex-for-review/scripts` (shared with
`/ask-codex-for-review`). `CR` = `node "$SCRIPTS/codex-review.mjs"`.
Each `CR` call prints one JSON object on stdout; parse it.

## Arguments
Parse `$ARGUMENTS`: a path → scope hint; `--fresh` → new review thread;
`--review-only` → review + report, no fixes; `--thread <name>` → explicit thread.

## Step 1 — Preflight
Run `$CR doctor`. If `ok:false`: codex missing → ask user to install Codex CLI and
stop; not logged in → ask them to run `codex login` and stop. The `vcs` field shows
`git` / `null` for the current directory.

## Step 2 — Prepare ONE consistent snapshot
Run `$CR snapshot --thread <name> [--max-bytes 300000]`. This builds, via `git`:
baseline = merge-base vs upstream/main/master; committed-vs-baseline + staged +
unstaged diffs + untracked; snapshot = git-format patch + current contents of
changed files.

Record from the result: `vcs`, `repoRoot`, `branch`, `baseline`, `fingerprint`,
`files`, `snapshotFile`, `truncated`. This `snapshotFile` + `baseline` is the single
consistent review context both reviewers get. If a path scope was given, mention it
in each reviewer's prompt (the snapshot covers the whole change; reviewers focus on
the path). If `truncated`, say so and raise `--max-bytes` if the change is large.

If `vcs` is `null`, there is no Git repo — tell the user and stop (nothing to review).

## Step 3 — Thread state (for iterative reviews)
Run `$CR status --thread <name>`. If `exists:true` and not `--fresh`, this is an
iterative review. Read the prior review from `lastReview.reviewFile` and the stored
`data` (previous Claude/Codex findings + resolutions). Prepare, SEPARATELY, each
reviewer's OWN previous findings + what was done about them — you will feed each
reviewer only its own history, never the other's.

## Step 4 — Launch BOTH reviews in parallel
Issue both in a SINGLE message (two tool calls) so they run concurrently. Give each
only the task requirements, architecture constraints, scope, the snapshot, and (if
iterating) its OWN prior findings + resolutions. Do NOT share one reviewer's findings
with the other. Do NOT include the implementation author's self-assessment beyond
what is needed to state the requirements.

**Claude Reviewer** — Agent tool, `subagent_type: ultra-code-reviewer` (if unavailable
in this session, use `general-purpose` and state read-only explicitly in the prompt).
Prompt must include: read-only rule; the task requirements; the scope; the
`snapshotFile` path (tell it to Read that file AND the real source in scope); the
structured-JSON output contract (findings with id/severity/confidence/file/line/
problem/scenario/fix + verdict); and, if iterating, its own previous findings to verify.

**Codex Reviewer** — Bash:
`$CR run --prompt-file <codexPrompt> --snapshot <snapshotFile> --thread <name> [--fresh] [--scope <path>] --timeout 600`
Write `<codexPrompt>` to a temp file: strict senior-engineer role; "review the
supplied changes and inspect relevant repository files as needed"; task requirements;
scope; focus areas; what to ignore; structured output contract; and, if iterating, a
feedback section on Codex's OWN previous findings (Fixed/Rejected+why/Deferred) asking
it to verify them and find new issues. The script passes the snapshot to Codex
embedded in the prompt (read-only).

Wait for BOTH to finish. If one fails (Codex `ok:false` / subagent error), proceed
with the other and report the partial failure — do not block the whole review.

## Step 5 — Consistency check
Run `$CR fingerprint --thread <name>` and compare to the snapshot `fingerprint` from
Step 2. If it changed, the files changed during review: report the inconsistency and
do not silently merge; re-snapshot and note which findings may be stale.

## Step 6 — Consolidate & validate
Collect both reviewers' structured findings. Deduplicate overlapping findings (same
file+line+root cause); mark each as discovered by Claude / Codex / Both. Then
INDEPENDENTLY validate every finding by reading the actual code:
- confirm it is real and in scope; check whether it is already handled;
- reject false positives with a concrete technical reason;
- agreement by both models is NOT proof; disagreement is NOT proof either way.

## Step 7 — Fix (skip if --review-only)
Before editing, re-check the target files are unchanged since the snapshot (compare
fingerprint, or inspect). If something changed, reconcile — never blind-overwrite
another agent's or the user's edits. Then fix only confirmed, in-scope issues,
preserving architecture and conventions. Do NOT commit, push, merge, or rebase; do
NOT revert unrelated changes; limit edits to the confirmed problems. Run the relevant
tests / typecheck / lint for what you changed.

## Step 8 — Record
Write a JSON file and run `$CR record --thread <name> --data-file <json>` with
`{claudeFindings, codexFindings, confirmed, rejected, fixes, remaining}`, plus a
`--note` summarizing resolutions. This persists both reviewers' findings and your
resolutions onto the just-created Codex iteration for the next run. (A subsequent
`/review-ultra` continues this thread; Codex continuity is its persistent session +
this replayed history, Claude continuity is the summary you feed its fresh subagent.)

## Step 9 — Report
Produce the structured report:
- **Review summary:** Claude findings N, Codex findings N, overlapping N, unique N.
- **Confirmed issues:** each with severity, description, file:line, discovered-by
  (Claude/Codex/Both), resolution (Fixed/Deferred).
- **Rejected findings:** each significant one with the technical reason.
- **Validation:** tests / typecheck / lint you ACTUALLY ran and their result.
- **Remaining risks:** unresolved issues + limitations.
- Include the `baseline` revision and `vcs` when useful.
Never claim a check passed unless you ran it.

## Notes
- History/logs live under `~/.claude/codex-review/` (shared with `/ask-codex-for-review`,
  override `$CODEX_REVIEW_HOME`), outside tracked files; bounded.
- Threads key on Git root + branch + thread name — unrelated tasks in the same repo
  stay separate; different branches/worktrees never share a session.
- `/ask-codex-for-review` still runs Codex only (no Claude reviewer) and shares this
  infrastructure.
