#!/usr/bin/env python3
"""Resolve the transitive dependency tree for a set of services.

Usage: resolve_deps.py [--worktree-slug <slug>] <services-json-path> <service> [<service>...]

Outputs JSON:

  {
    "targets": ["api-server"],
    "deps": ["database-ready", "storage-ready", "api-server-migrations"]
  }

targets: the originally-requested service names (not Tilt resource names).
deps: inferred dependency resource names (infra + migrations) that Tilt must
      bring up before the targets can be healthy. These are Tilt resource names
      (not user-facing service names). When --worktree-slug is given, migration
      dep names are worktree-prefixed (e.g. "api-server-wt-rep-397-migrations"
      instead of "api-server-migrations").
"""

import json
import sys
from collections import deque

from wt_name import wt_name


def _strip_optional_prefix(args):
    """Parse --worktree-slug <slug> prefix if present, return (slug, remaining)."""
    if len(args) >= 2 and args[0] == "--worktree-slug":
        return args[1], args[2:]
    return None, args


def main():
    worktree_slug, positional = _strip_optional_prefix(sys.argv[1:])

    if len(positional) < 2:
        print(json.dumps({"targets": [], "deps": []}))
        return

    services_path = positional[0]
    requested = list(positional[1:])

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
                    if worktree_slug:
                        infra_deps.add(
                            wt_name(db_backed_by, worktree_slug) + "-migrations"
                        )
                    else:
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
