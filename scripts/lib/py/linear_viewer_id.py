#!/usr/bin/env python3
"""Extract the Linear viewer id from a GraphQL response."""

from __future__ import annotations

import json
import sys


def main(argv: list[str] | None = None) -> int:
    payload = json.load(sys.stdin)
    data = payload.get("data") if isinstance(payload, dict) else {}
    viewer = data.get("viewer") if isinstance(data, dict) else {}
    viewer_id = viewer.get("id") if isinstance(viewer, dict) else ""
    if not viewer_id:
        return 1

    print(viewer_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
