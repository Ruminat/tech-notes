---
name: net-back
description: Resume after a network drop.
disable-model-invocation: true
---

# net-back

The network is back after a drop. Resume exactly where things were interrupted.

1. Look at the last thing we were working on and what's left unfinished.
2. If the last action (a command, a file write, a request) might not have completed because of the drop — verify its result before moving on. Don't blindly repeat operations that aren't safe to retry.
3. Finish the task in progress without re-asking permission for what was already agreed.

If it's completely unclear where we stopped — briefly say what you see and resume from the most likely point.
