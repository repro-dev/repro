#!/usr/bin/env python3
"""List active service names for a given worktree slug.

Usage: worktree_services.py <config_json> <slug>

Reads the reproctl_services.json content (passed as a string argument),
filters for services matching the given worktree slug, and prints a
comma-separated list of service names.
"""

import json
import sys

try:
    cfg = json.loads(sys.argv[1])
    slug = sys.argv[2]
    names = [s["name"] for s in cfg.get("services", []) if s.get("slug") == slug]
    print(", ".join(names))
except Exception:
    pass
