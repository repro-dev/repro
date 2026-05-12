#!/usr/bin/env python3
"""Find an active autobot claim for an issue."""

from __future__ import annotations

import json
import sys


ACTIVE_CLAIM_STATES = {"claimed", "running", "reconciling"}


def _claims(payload: object) -> list[dict[str, object]]:
    if isinstance(payload, dict):
        items = payload.get("items")
        if isinstance(items, list):
            return [item for item in items if isinstance(item, dict)]
        claims = payload.get("claims")
        if isinstance(claims, list):
            return [claim for claim in claims if isinstance(claim, dict)]
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    return []


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        print("Usage: autobot_active_claim.py <issue-identifier>", file=sys.stderr)
        return 1

    target = args[0]
    payload = json.load(sys.stdin)

    for item in _claims(payload):
        if item.get("issue_identifier") == target and item.get("claim_state") in ACTIVE_CLAIM_STATES:
            print(json.dumps(item))
            return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
