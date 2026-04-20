#!/bin/bash

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$TESTS_DIR/../../../.." && pwd -P)"

tmpdir="$(mktemp -d 2>/dev/null || mktemp -d -t linear-wrapper)"
trap 'rm -rf "$tmpdir"' EXIT

called_args="$tmpdir/called-args"

cat > "$tmpdir/node" <<EOF
#!/bin/bash
printf '%s\n' "\$@" > '$called_args'
exit 0
EOF
chmod +x "$tmpdir/node"

PATH="$tmpdir:$PATH" bash "$REPO_ROOT/bin/linear" --help >/dev/null 2>&1

expected="$REPO_ROOT/scripts/lib/linear/cli.mjs"
first_arg="$(sed -n '1p' "$called_args")"
second_arg="$(sed -n '2p' "$called_args")"
third_arg="$(sed -n '3p' "$called_args")"

if [ "$first_arg" = "$expected" ] && [ "$second_arg" = "--help" ] && [ -z "$third_arg" ]; then
  printf '✔ bin/linear resolves the repo-local JS entrypoint\n'
else
  printf '✖ bin/linear wrapper\nexpected: %s --help\nactual: %s %s\n' "$expected" "$first_arg" "$second_arg" >&2
  exit 1
fi
