---
name: my-skills
description: List installed skills.
disable-model-invocation: true
---

# my-skills

List all custom (user-installed) skills with their prompts.

## What counts as "my" skills

Scan the filesystem — these are installed/custom skills, as opposed to built-in ones:

- Personal (global): `~/.claude/skills/*/SKILL.md`
- Project: `.claude/skills/*/SKILL.md` in the current project (and parent directories, if any)
- Plugins: `~/.claude/plugins/**/skills/*/SKILL.md`

A symlink is an installed skill too — follow it and read the real `SKILL.md`.

## What to show per skill

Read each skill's `SKILL.md` and show:

1. **Name** (the `name` frontmatter field, or the directory name).
2. **Prompt** — the `SKILL.md` body (everything after the frontmatter):
   - Up to two sentences — print it **verbatim**.
   - Longer — **summarize** in one or two sentences what the skill does.

## Output format

Group by source: Personal / Project / Plugins. One line per skill: `**name** — prompt (verbatim) or short description`.

If no skills are found in any location — say so.
