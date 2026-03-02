#!/usr/bin/env python3
"""Upsert a service entry into the reproctl JSON config.

Reads JSON from stdin, adds or replaces a service entry matching
(SVC_NAME, SVC_SLUG), and writes the updated JSON to stdout.

Environment variables:
  SVC_NAME   — service name
  SVC_SOURCE — source path
  SVC_SLUG   — worktree slug (empty string for main checkout)
"""

import json
import os
import sys

data = json.load(sys.stdin)
svc_name = os.environ["SVC_NAME"]
source = os.environ["SVC_SOURCE"]
slug = os.environ["SVC_SLUG"]
services = data.get("services", [])
services = [
    s for s in services if not (s["name"] == svc_name and s.get("slug", "") == slug)
]
services.append({"name": svc_name, "source": source, "slug": slug})
data["services"] = services
json.dump(data, sys.stdout, indent=2)
