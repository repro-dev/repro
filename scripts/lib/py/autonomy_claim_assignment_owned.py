#!/usr/bin/env python3
"""Read autonomy status JSON and report claim assignment ownership."""

from __future__ import annotations

import json
import sys


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        print("Usage: autonomy_claim_assignment_owned.py <issue-identifier>", file=sys.stderr)
        return 1

    issue_identifier = args[0]
    payload = json.load(sys.stdin)
    items = payload.get("items") if isinstance(payload, dict) else []
    if not isinstance(items, list):
        items = []

    for item in items:
        if isinstance(item, dict) and item.get("issue_identifier") == issue_identifier:
            print(str(bool(item.get("linear_assignment_owned"))).lower())
            return 0

    print("false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
