#!/usr/bin/env python3
"""Public queue helpers for autobot."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


PUBLIC_STATE_MAP = {
    "queued": "queued",
    "claimed": "queued",
    "running": "running",
    "reconciling": "needs_attention",
    "failed": "needs_attention",
    "error": "needs_attention",
    "stale": "needs_attention",
    "released": "released",
    "canceled": "removed",
}

NON_TERMINAL_PUBLIC_STATES = {"queued", "running", "needs_attention"}


def _mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    items = payload.get("items")
    if not isinstance(items, list):
        items = []
    return [item for item in items if isinstance(item, dict)]


def public_state(claim_state: str) -> str:
    return PUBLIC_STATE_MAP.get(claim_state, claim_state or "needs_attention")


def public_item(item: dict[str, Any]) -> dict[str, Any]:
    state = public_state(str(item.get("claim_state") or ""))
    public: dict[str, Any] = {
        "issue_identifier": str(item.get("issue_identifier") or item.get("identifier") or ""),
        "state": state,
        "phase": str(item.get("phase") or ""),
        "workspace_path": str(item.get("workspace_path") or ""),
        "queued_by": str(item.get("claimed_by") or ""),
        "updated_at": str(item.get("updated_at") or ""),
        "attempt_count": int(item.get("attempt_count") or 0),
        "last_observed_issue_state_name": str(item.get("last_observed_issue_state_name") or ""),
        "last_observed_issue_state_type": str(item.get("last_observed_issue_state_type") or ""),
    }
    reason = item.get("retry_reason") or item.get("last_error") or item.get("linear_sync_error")
    if reason:
        public["reason"] = str(reason)
    return public


def public_summary(items: list[dict[str, Any]]) -> dict[str, int]:
    counts = {
        "queued": 0,
        "running": 0,
        "needs_attention": 0,
        "released": 0,
        "removed": 0,
    }
    for item in items:
        state = str(item.get("state") or "")
        if state in counts:
            counts[state] += 1
    return {"total": len(items), **counts}


def _public_items(payload: dict[str, Any], issue_identifier: str | None = None) -> list[dict[str, Any]]:
    items = _items(payload)
    public = [public_item(item) for item in items]
    if issue_identifier:
        public = [item for item in public if item["issue_identifier"] == issue_identifier]
        return public
    return [item for item in public if item["state"] in NON_TERMINAL_PUBLIC_STATES]


def shape_status(payload: dict[str, Any], issue_identifier: str | None = None) -> dict[str, Any]:
    items = _public_items(payload, issue_identifier=issue_identifier)
    summary_items = [public_item(item) for item in _items(payload)]
    return {
        "items": items,
        "summary": public_summary(summary_items),
        "runs": payload.get("runs") if isinstance(payload.get("runs"), list) else [],
        "generated_at": payload.get("generated_at") or "",
        "query_issue_identifier": issue_identifier or "",
    }


def discover_issue_ids(payload: dict[str, Any]) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            identifier = str(value.get("issue_identifier") or value.get("identifier") or "").strip()
            if identifier and identifier not in seen:
                seen.add(identifier)
                ids.append(identifier)
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(payload)
    return ids


def parse_log_bundle(engine_log_path: Path, issue_log_paths: list[Path]) -> dict[str, Any]:
    engine_lines = engine_log_path.read_text(encoding="utf-8").splitlines() if engine_log_path.exists() else []
    issue_bundles: list[dict[str, Any]] = []

    for path in issue_log_paths:
        lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
        events: list[dict[str, Any]] = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                events.append({"kind": "line", "text": line})

        stem = path.parent.name
        issue_identifier = stem.split("-attempt-", 1)[0] if "-attempt-" in stem else stem
        issue_bundles.append(
            {
                "path": str(path),
                "issue_identifier": issue_identifier,
                "lines": lines,
                "events": events,
            }
        )

    return {
        "engine": {"path": str(engine_log_path), "lines": engine_lines},
        "issues": issue_bundles,
    }


def _load_json(text: str) -> dict[str, Any]:
    try:
        payload = json.loads(text or "{}")
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive CLI path
        raise SystemExit("input payload must be valid JSON") from exc
    return _mapping(payload)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="autobot_queue.py")
    subparsers = parser.add_subparsers(dest="command", required=True)

    status = subparsers.add_parser("status")
    status.add_argument("--issue")

    list_cmd = subparsers.add_parser("list")

    logs = subparsers.add_parser("logs")
    logs.add_argument("--engine-log", required=True)
    logs.add_argument("--issue-log", action="append", default=[])

    discover = subparsers.add_parser("discover-ids")

    args = parser.parse_args(argv)
    payload = _load_json(sys.stdin.read())

    if args.command == "status":
        print(json.dumps(shape_status(payload, issue_identifier=args.issue)))
        return 0

    if args.command == "list":
        print(json.dumps(shape_status(payload)))
        return 0

    if args.command == "logs":
        issue_paths = [Path(path) for path in args.issue_log]
        print(json.dumps(parse_log_bundle(Path(args.engine_log), issue_paths)))
        return 0

    if args.command == "discover-ids":
        print("\n".join(discover_issue_ids(payload)))
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
