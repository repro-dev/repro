#!/usr/bin/env python3
"""Emit eligible autobot monitor issue IDs."""

from __future__ import annotations

import json
import sys


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        print("Usage: autobot_monitor_issue_ids.py <evaluation-json>", file=sys.stderr)
        return 1

    payload = json.loads(args[0])
    items = payload.get("items", []) if isinstance(payload, dict) else []
    if not isinstance(items, list):
        return 1

    for item in items:
        if isinstance(item, dict) and item.get("eligible"):
            print(item.get("issue_identifier", ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
