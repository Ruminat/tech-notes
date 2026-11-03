#!/usr/bin/env bash
# Claude Code hook: set the terminal tab title via an OSC 2 sequence.
# Usage: tab-title.sh <phase>     phase = working (⏳) | done (✅)
#
# Title:  <emoji> <task name or folder>
# Hook input has no session_name; UserPromptSubmit carries session_title (only
# when a name was set manually), otherwise we fall back to the cwd basename.
# Emits {"terminalSequence": "...OSC 2..."} on stdout. Never fails; exits 0.

case "${1:-}" in
  working) emoji="⏳" ;;
  done)    emoji="✅" ;;
  *)       emoji="" ;;
esac

command -v jq >/dev/null 2>&1 || { printf '{}\n'; exit 0; }

input=$(cat)

title=$(printf '%s' "$input" | jq -r '.session_title // .session_name // empty' 2>/dev/null)
current_dir=$(printf '%s' "$input" | jq -r '.workspace.current_dir // .cwd // empty' 2>/dev/null)

# Fall back to the folder name when no session title is set.
if [ -z "$title" ] && [ -n "$current_dir" ]; then
  title=$(basename "$current_dir")
fi

label="$title"
[ -n "$emoji" ] && [ -n "$label" ] && label="$emoji $label"
[ -n "$emoji" ] && [ -z "$label" ] && label="$emoji"

# OSC 2 ; <text> BEL  (ESC=\033, BEL=\007). Build the JSON with jq so the
# control bytes and any UTF-8 in the title are escaped into valid JSON.
seq=$(printf '\033]2;%s\007' "$label")
jq -cn --arg seq "$seq" '{terminalSequence: $seq}' 2>/dev/null || printf '{}\n'
exit 0
