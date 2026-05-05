#!/usr/bin/env python3
"""Build monitor payloads from projected Linear issue list responses."""

from __future__ import annotations

import json
import sys


def _extract_items(payload: object) -> list[dict[str, object]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        items = payload.get("items")
        if isinstance(items, list):
            return [item for item in items if isinstance(item, dict)]
        data = payload.get("data")
        if isinstance(data, dict):
            issues = data.get("issues")
            if isinstance(issues, dict):
                nodes = issues.get("nodes")
                if isinstance(nodes, list):
                    return [item for item in nodes if isinstance(item, dict)]
    return []


def _candidate_ids(backlog_payload: object, todo_payload: object) -> list[str]:
    seen: set[str] = set()
    identifiers: list[str] = []

    for payload in (backlog_payload, todo_payload):
        for issue in _extract_items(payload):
            identifier = str(issue.get("identifier") or issue.get("issue_identifier") or "")
            if identifier and identifier not in seen:
                seen.add(identifier)
                identifiers.append(identifier)

    return identifiers


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 3:
        print("Usage: autonomy_monitor_payload.py <backlog-json> <todo-json> <claims-json>", file=sys.stderr)
        return 1

    backlog_payload = json.loads(args[0])
    todo_payload = json.loads(args[1])
    claims_payload = json.loads(args[2])

    issue_map: dict[str, dict[str, object]] = {}
    for payload in (backlog_payload, todo_payload):
        for issue in _extract_items(payload):
            identifier = str(issue.get("identifier") or issue.get("issue_identifier") or "")
            if identifier and identifier not in issue_map:
                issue_map[identifier] = issue

    issues = [issue_map[identifier] for identifier in _candidate_ids(backlog_payload, todo_payload) if identifier in issue_map]

    claims = claims_payload.get("items", []) if isinstance(claims_payload, dict) else []
    if not isinstance(claims, list):
        claims = []

    print(json.dumps({"issues": issues, "claims": claims}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
