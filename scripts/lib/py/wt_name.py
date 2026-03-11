"""Compute a length-safe worktree resource name.

Replicates the wt_name() algorithm from infra/tilt-lib/services.Tiltfile
so that shell tooling produces identical resource names.

Usage: python3 wt_name.py <base> <slug> [max_len]
"""

import sys


def _hash_suffix(s):
    h = 0
    for c in s:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return "%x" % h


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
    if len(sys.argv) < 3:
        print("Usage: wt_name.py <base> <slug> [max_len]", file=sys.stderr)
        sys.exit(1)

    base = sys.argv[1]
    slug = sys.argv[2]
    max_len = int(sys.argv[3]) if len(sys.argv) > 3 else 49

    print(wt_name(base, slug, max_len))
