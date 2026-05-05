#!/usr/bin/env python3
"""Render autonomy monitor evaluations as text."""

from __future__ import annotations

import json
import sys


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        print("Usage: autonomy_monitor_render.py <evaluation-json>", file=sys.stderr)
        return 1

    payload = json.loads(args[0])
    items = payload.get("items", []) if isinstance(payload, dict) else []

    print("MONITOR")
    if not isinstance(items, list) or not items:
        print("  (none)")
        return 0

    for item in items:
        if not isinstance(item, dict):
            continue
        parts = ["eligible" if item.get("eligible") else "blocked"]
        parts.append(f"action={item.get('action', '')}")
        if item.get("reasons"):
            parts.append(f"reasons={','.join(item['reasons'])}")
        if item.get("notes"):
            parts.append(f"notes={','.join(item['notes'])}")
        print(f"  {item.get('issue_identifier', '')}  priority={item.get('priority', '')}  " + "  ".join(parts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
