#!/usr/bin/env python3
"""Produce JSON output for `reproctl wt list --json`.

Usage: worktree_list_json.py <porcelain> <config_json>

Arguments:
  porcelain    - output of `git worktree list --porcelain`
  config_json  - contents of reproctl_services.json (or empty string)

Outputs a JSON array to stdout with one object per worktree:
  [{"slug", "path", "branch", "head", "bare", "services"}, ...]
"""

import json
import os
import sys


def parse_porcelain(text: str) -> list[dict]:
    worktrees: list[dict] = []
    current: dict = {}

    for line in text.splitlines():
        if line.startswith("worktree "):
            current["path"] = line[len("worktree ") :]
        elif line.startswith("HEAD "):
            current["head"] = line[len("HEAD ") :][:8]
        elif line.startswith("branch "):
            ref = line[len("branch ") :]
            current["branch"] = ref.removeprefix("refs/heads/")
        elif line == "bare":
            current["bare"] = True
        elif line == "detached":
            current["detached"] = True
        elif line == "":
            if current:
                worktrees.append(current)
                current = {}

    if current:
        worktrees.append(current)

    return worktrees


def slug_from_path(path: str) -> str:
    basename = os.path.basename(path)
    if basename.startswith("repro-wt-"):
        return basename[len("repro-wt-") :]
    return "main"


def services_for_slug(config: dict, slug: str) -> list[str]:
    return [s["name"] for s in config.get("services", []) if s.get("slug") == slug]


def main() -> None:
    porcelain = sys.argv[1] if len(sys.argv) > 1 else ""
    config_str = sys.argv[2] if len(sys.argv) > 2 else ""

    config: dict = {}
    if config_str:
        try:
            config = json.loads(config_str)
        except (json.JSONDecodeError, TypeError):
            pass

    entries = parse_porcelain(porcelain)
    result = []

    for entry in entries:
        path = entry.get("path", "")
        slug = slug_from_path(path)
        bare = entry.get("bare", False)

        if bare:
            branch = None
        elif entry.get("detached"):
            branch = None
        else:
            branch = entry.get("branch")

        result.append(
            {
                "slug": slug,
                "path": path,
                "branch": branch,
                "head": entry.get("head", ""),
                "bare": bare,
                "services": services_for_slug(config, slug),
            }
        )

    print(json.dumps({"items": result}))


if __name__ == "__main__":
    main()
