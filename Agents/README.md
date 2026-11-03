# Agents

The portable (generic, git-only) part of my Claude Code config: skills, an agent, hooks, a status line, and a settings template. Nothing tied to internal infrastructure.

## Layout

```
skills/<name>/SKILL.md   custom skills
agents/                  subagents
hooks/tab-title.sh       terminal tab title (OSC 2)
statusline.sh            status line: <session> · <cwd>
settings.example.json    template for ~/.claude/settings.json (merge, don't copy wholesale)
```

## Skills

| Skill | Invocation | What it does |
|---|---|---|
| `bad-names` | manual | rename overly-generic identifiers |
| `no-comments` | manual | strip pointless comments |
| `wtf` | manual | re-explain in plain language |
| `net-back` | manual | resume after a network drop |
| `my-skills` | manual | list installed skills |
| `codex-done` | manual | review Codex's work, commit, push |
| `mock-it` | auto | temporarily mock a UI state for a screenshot |
| `ask-codex-for-review` | auto | review current changes via Codex CLI |
| `review-ultra` | auto | dual review (Claude subagent + Codex) |

"manual" = `disable-model-invocation: true` (only via `/<name>`; the model never calls it itself).

## Install

Copy what you want into `~/.claude/` (or symlink it):

```sh
ln -s "$PWD/skills/"*        ~/.claude/skills/
ln -s "$PWD/agents/"*        ~/.claude/agents/
ln -s "$PWD/hooks/tab-title.sh" ~/.claude/hooks/
ln -s "$PWD/statusline.sh"   ~/.claude/statusline.sh
```

Move the parts you want from `settings.example.json` into `~/.claude/settings.json`.

## External dependencies

- `ask-codex-for-review` / `review-ultra` — [OpenAI Codex CLI](https://github.com/openai/codex) (`codex login`), read-only.
- `settings.example.json` references the `frontend-design` plugin from the public `anthropics/claude-code` marketplace.
