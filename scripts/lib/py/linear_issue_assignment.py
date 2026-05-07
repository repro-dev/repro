#!/usr/bin/env python3
"""Extract a Linear issue UUID and assignee id from an issues query response."""

from __future__ import annotations

import json
import sys


def main(argv: list[str] | None = None) -> int:
    payload = json.load(sys.stdin)
    data = payload.get("data") if isinstance(payload, dict) else {}
    issues = data.get("issues") if isinstance(data, dict) else {}
    nodes = issues.get("nodes") if isinstance(issues, dict) else []
    if not isinstance(nodes, list) or not nodes:
        return 1

    node = nodes[0] if isinstance(nodes[0], dict) else {}
    issue_id = node.get("id", "")
    assignee = node.get("assignee") if isinstance(node.get("assignee"), dict) else {}
    assignee_id = assignee.get("id", "") if isinstance(assignee, dict) else ""
    if not issue_id:
        return 1

    print(issue_id)
    print(assignee_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
