#!/usr/bin/env python3
"""Format a Linear issue GraphQL response into a markdown bundle fragment.

Reads the full API JSON (from an ``issue`` query) on stdin.
Outputs a markdown fragment suitable for the ``## Issue`` section of a
context bundle document.

If the response contains no issue data, prints nothing and exits 0.
"""

import json
import sys
import textwrap

data = json.load(sys.stdin)

node = data.get("data", {}).get("issue")
if node is None:
    nodes = data.get("data", {}).get("issueSearch", {}).get("nodes", [])
    if not nodes:
        sys.exit(0)
    node = nodes[0]

identifier = node.get("identifier", "")
title = node.get("title", "")
description = node.get("description", "")

lines = []
lines.append(f"Title: {title}")

if description:
    trimmed = description.strip()
    if len(trimmed) > 1500:
        trimmed = trimmed[:1500].rsplit("\n", 1)[0] + "\n\n[...truncated]"
    lines.append(f"Description:\n{trimmed}")

print("\n".join(lines))
