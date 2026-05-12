#!/usr/bin/env python3
"""Extract a Linear issue UUID from issue JSON."""

from __future__ import annotations

import json
import sys


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        print("Usage: autobot_issue_id.py <issue-json>", file=sys.stderr)
        return 1

    payload = json.loads(args[0])
    item = payload.get("item") if isinstance(payload, dict) else {}
    if not isinstance(item, dict):
        item = {}

    issue_id = item.get("id") or item.get("identifier") or item.get("issue_identifier") or ""
    if not issue_id:
        return 1

    print(issue_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
