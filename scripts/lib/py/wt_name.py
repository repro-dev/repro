"""Compute length-safe worktree slugs and resource names.

Replicates the wt_name() algorithm from infra/tilt-lib/services.Tiltfile
so that shell tooling produces identical resource names.

Usage:
  python3 wt_name.py name  <base> <slug> [max_len]
  python3 wt_name.py slug  <raw_slug> [max_len]
"""

import sys

MAX_SLUG_LEN = 60


def _hash_suffix(s):
    h = 0
    for c in s:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return "%x" % h


def truncate_slug(raw, max_len=MAX_SLUG_LEN):
    if len(raw) <= max_len:
        return raw

    hash_part = _hash_suffix(raw)[:6]
    budget = max_len - 1 - 6
    if budget < 1:
        budget = 1
    truncated = raw[:budget]
    if truncated.endswith("-"):
        truncated = truncated[:-1]
    return truncated + "-" + hash_part


def wt_name(base, slug, max_len=49):
    full = base + "-wt-" + slug
    if len(full) <= max_len:
        return full

    hash_suffix = _hash_suffix(slug)[:6]
    budget = max_len - len(base) - len("-wt-") - 1 - 6
    if budget < 1:
        budget = 1
    return base + "-wt-" + slug[:budget] + "-" + hash_suffix


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: wt_name.py <name|slug> ...", file=sys.stderr)
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "name":
        if len(sys.argv) < 4:
            print("Usage: wt_name.py name <base> <slug> [max_len]", file=sys.stderr)
            sys.exit(1)
        base = sys.argv[2]
        slug = sys.argv[3]
        max_len = int(sys.argv[4]) if len(sys.argv) > 4 else 49
        print(wt_name(base, slug, max_len))

    elif cmd == "slug":
        if len(sys.argv) < 3:
            print("Usage: wt_name.py slug <raw_slug> [max_len]", file=sys.stderr)
            sys.exit(1)
        raw = sys.argv[2]
        max_len = int(sys.argv[3]) if len(sys.argv) > 3 else MAX_SLUG_LEN
        print(truncate_slug(raw, max_len))

    else:
        base = cmd
        slug = sys.argv[2] if len(sys.argv) > 2 else ""
        max_len = int(sys.argv[3]) if len(sys.argv) > 3 else 49
        print(wt_name(base, slug, max_len))
