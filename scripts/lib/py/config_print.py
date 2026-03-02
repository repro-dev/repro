#!/usr/bin/env python3
"""Pretty-print active services from the reproctl JSON config.

Reads JSON from stdin and prints a human-readable service list.
"""

import json
import sys

data = json.load(sys.stdin)
services = data.get("services", [])
if not services:
    print("  (none)")
else:
    for s in services:
        slug = s.get("slug", "")
        if slug:
            print("  %s (wt: %s)" % (s["name"], slug))
        else:
            print("  %s (main)" % s["name"])
