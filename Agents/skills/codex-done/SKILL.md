---
name: codex-done
description: Review Codex's work, commit, push.
disable-model-invocation: true
---

# codex-done

1. **See what Codex did.** Review the uncommitted changes (`git status`, `git diff`) and recent commits — understand what changed and why.
2. **Review the changes.** Read the changed code critically: does it match the task, any bugs, regressions, leftover junk, mismatches with project style? Run tests/linter/build if needed.
3. **Make fixes if you agree with the direction.** If the overall approach is right but rough, polish it yourself. If the approach is wrong — don't commit blindly: explain the problem and propose what to do.
4. **Commit and push.** If the current branch is the main one (`main`/`master`), create a branch first. Follow the project's commit and PR rules from CLAUDE.md.

Report briefly: what you checked, what you fixed, what you committed and pushed.
