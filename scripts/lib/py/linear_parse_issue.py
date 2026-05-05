#!/usr/bin/env python3
"""Parse a Linear ``issues`` GraphQL response.

Reads the full API JSON from stdin. Outputs newline-delimited fields:

    line 1: issue UUID
    line 2: identifier (e.g. REP-123)
    line 3: title
    line 4: branchName
    line 5: "In Progress" state ID (empty string if not found)

If no matching issue is found, prints ``NOT_FOUND`` and exits 0.

Output fields:

    line 1: issue UUID
    line 2: identifier (e.g. REP-123)
    line 3: title
    line 4: branchName
    line 5: "In Progress" state ID (empty string if not found)
    line 6: current state name (empty string if not present)
    line 7: current state type (empty string if not present)
"""

import json
import sys

data = json.load(sys.stdin)
nodes = data.get("data", {}).get("issues", {}).get("nodes", [])

if not nodes:
    print("NOT_FOUND")
    sys.exit(0)

node = nodes[0]
states = node.get("team", {}).get("states", {}).get("nodes", [])
in_progress = [
    s for s in states if s["type"] == "started" and s["name"] == "In Progress"
]
state_id = in_progress[0]["id"] if in_progress else ""
current_state = node.get("state", {}) if isinstance(node.get("state", {}), dict) else {}

print(node["id"])
print(node["identifier"])
print(node["title"])
print(node["branchName"])
print(state_id)
print(current_state.get("name", ""))
print(current_state.get("type", ""))
