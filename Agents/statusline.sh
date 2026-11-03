#!/usr/bin/env bash
# Claude Code status line (user-level).
# Renders:  <session_name> · <current_dir(~)>
#   - session_name: shown only when present (custom/AI session name)
#   - current dir:  with $HOME collapsed to ~
# Reads the session JSON on stdin. Never fails; always exits 0.

command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)

session_name=$(printf '%s' "$input" | jq -r '.session_name // empty' 2>/dev/null)
current_dir=$(printf '%s' "$input" | jq -r '.workspace.current_dir // .cwd // empty' 2>/dev/null)

# Second segment: the cwd with $HOME -> ~.
location=""
if [ -n "$current_dir" ]; then
  case "$current_dir" in
    "$HOME")   location="~" ;;
    "$HOME"/*) location="~${current_dir#"$HOME"}" ;;
    *)         location="$current_dir" ;;
  esac
fi

# Assemble; drop empty segments (and their separator) so there's no stray " · ".
out=""
[ -n "$session_name" ] && out="$session_name"
if [ -n "$location" ]; then
  if [ -n "$out" ]; then out="$out · $location"; else out="$location"; fi
fi

printf '%s' "$out"
exit 0
