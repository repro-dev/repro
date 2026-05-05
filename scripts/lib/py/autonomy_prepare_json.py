#!/usr/bin/env python3
"""Render JSON responses for autonomy prepare flows."""

from __future__ import annotations

import json
import sys


def _usage() -> int:
    print(
        "Usage: autonomy_prepare_json.py existing-claim <claim-json> | prepare <phase> <claimed-by> <issue-id> <issue-identifier> <workspace-path> <branch> <slug> <issue-state-name> <issue-state-type> <claim-json>",
        file=sys.stderr,
    )
    return 1


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if not args:
        return _usage()

    mode = args[0]
    if mode == "existing-claim":
        if len(args) != 2:
            return _usage()
        claim = json.loads(args[1])
        print(json.dumps({"error": "existing claim", "claim": claim}))
        return 0

    if mode == "prepare":
        if len(args) != 11:
            return _usage()

        phase = args[1]
        claimed_by = args[2] or None
        issue_id = args[3]
        issue_identifier = args[4]
        workspace_path = args[5]
        branch = args[6]
        slug = args[7]
        issue_state_name = args[8]
        issue_state_type = args[9]
        claim_json = json.loads(args[10])
        claim = claim_json.get("claim") if isinstance(claim_json, dict) else None

        print(
            json.dumps(
                {
                    "prepare": {
                        "issue_id": issue_id,
                        "issue_identifier": issue_identifier,
                        "workspace_path": workspace_path,
                        "branch": branch,
                        "slug": slug,
                        "phase": phase,
                        "claimed_by": claimed_by,
                        "issue_state_name": issue_state_name,
                        "issue_state_type": issue_state_type,
                        "claim": claim,
                    }
                }
            )
        )
        return 0

    return _usage()


if __name__ == "__main__":
    raise SystemExit(main())
