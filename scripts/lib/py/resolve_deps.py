#!/usr/bin/env python3
"""Resolve the transitive dependency tree for a set of services.

Usage: resolve_deps.py <services-json-path> <service> [<service>...]

Outputs JSON:

  {
    "targets": ["api-server"],
    "deps": ["database-ready", "storage-ready", "api-server-migrations"]
  }

targets: the originally-requested service names (not Tilt resource names).
deps: inferred dependency resource names (infra + migrations) that Tilt must
      bring up before the targets can be healthy. These are Tilt resource names
      (not user-facing service names), and do NOT include worktree suffixes —
      the caller handles that.
"""

import json
import sys
from collections import deque


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"targets": [], "deps": []}))
        return

    services_path = sys.argv[1]
    requested = list(sys.argv[2:])

    with open(services_path) as f:
        services = json.load(f)

    all_service_deps = set()
    queue = deque(requested)
    visited = set(requested)

    while queue:
        svc = queue.popleft()
        cfg = services.get(svc)
        if cfg is None:
            continue
        for dep in cfg.get("deps", []):
            all_service_deps.add(dep)
            if dep not in visited:
                visited.add(dep)
                queue.append(dep)

    infra_deps = set()

    for svc in visited:
        cfg = services.get(svc)
        if cfg is None:
            continue

        svc_type = cfg.get("type", "k8s")

        if svc_type == "local":
            for rd in cfg.get("resource_deps", []):
                infra_deps.add(rd)
            db_backed_by = cfg.get("db_backed_by")
            if db_backed_by:
                backing = services.get(db_backed_by, {})
                mig = backing.get("migrations")
                if mig:
                    for rd in mig.get("resource_deps", []):
                        infra_deps.add(rd)
                    infra_deps.add(db_backed_by + "-migrations")
            continue

        mig = cfg.get("migrations")
        if mig:
            for rd in mig.get("resource_deps", []):
                infra_deps.add(rd)
            infra_deps.add(svc + "-migrations")

        seed = cfg.get("seed")
        if seed:
            for rd in seed.get("resource_deps", []):
                infra_deps.add(rd)

    dep_resources = sorted(infra_deps | {d for d in all_service_deps})

    print(json.dumps({"targets": requested, "deps": dep_resources}))


if __name__ == "__main__":
    main()
