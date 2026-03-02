#!/usr/bin/env python3
"""Remove a service entry from the reproctl JSON config.

Reads JSON from stdin, removes the service entry matching
(SVC_NAME, SVC_SLUG), and writes the updated JSON to stdout.

Environment variables:
  SVC_NAME — service name
  SVC_SLUG — worktree slug (empty string for main checkout)
"""

import json
import os
import sys

data = json.load(sys.stdin)
svc_name = os.environ["SVC_NAME"]
slug = os.environ["SVC_SLUG"]
services = data.get("services", [])
services = [
    s for s in services if not (s["name"] == svc_name and s.get("slug", "") == slug)
]
data["services"] = services
json.dump(data, sys.stdout, indent=2)
