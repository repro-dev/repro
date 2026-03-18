#!/bin/bash
#
# scripts/generate-manpages.sh — convert markdown manpage sources to groff
#
# Converts docs/man/*.1.md → docs/man/man1/*.1 using pandoc.
# Generated groff files are checked in so consumers don't need pandoc.
#
# Usage:
#   scripts/generate-manpages.sh          # generate all manpages
#   scripts/generate-manpages.sh --check  # verify generated files are up to date

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAN_SRC="$REPO_ROOT/docs/man"

if ! command -v pandoc > /dev/null 2>&1; then
  echo "error: pandoc is not installed. Run 'reproctl setup' or 'brew install pandoc'." >&2
  exit 1
fi

check_mode=false
if [ "${1:-}" = "--check" ]; then
  check_mode=true
fi

stale=()
total=0
for section in 1 7; do
  outdir="$MAN_SRC/man${section}"
  mkdir -p "$outdir"
  for src in "$MAN_SRC"/*."${section}".md; do
    [ -f "$src" ] || continue
    name="$(basename "$src" .md)"
    out="$outdir/$name"

    if [ "$check_mode" = true ]; then
      tmp="$(mktemp)"
      pandoc -s --from markdown-smart -t man "$src" -o "$tmp"
      if [ ! -f "$out" ] || ! diff -q "$tmp" "$out" > /dev/null 2>&1; then
        stale+=("$name")
      fi
      rm -f "$tmp"
    else
      pandoc -s --from markdown-smart -t man "$src" -o "$out"
      echo "  generated $name"
      total=$((total + 1))
    fi
  done
done

if [ "$check_mode" = true ]; then
  if [ ${#stale[@]} -gt 0 ]; then
    echo "error: the following manpages are out of date:" >&2
    for f in "${stale[@]}"; do
      echo "  $f" >&2
    done
    echo "Run 'scripts/generate-manpages.sh' to regenerate." >&2
    exit 1
  else
    echo "All manpages are up to date."
  fi
else
  echo "Done. Generated $total manpage(s)."
fi
