#!/usr/bin/env python3
"""Public queue helpers for autobot."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
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


def _normalize_condition(value: Any) -> dict[str, Any] | None:
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        return {"kind": "condition", "value": value}

    if not isinstance(value, dict):
        return None

    kind = str(value.get("kind") or value.get("type") or value.get("name") or "condition").strip()
    condition_value = value.get("value")
    if condition_value in (None, ""):
        condition_value = value.get("reason") or value.get("state") or value.get("message") or value.get("text") or ""
    condition_value = str(condition_value).strip()
    if not condition_value:
        return None

    return {"kind": kind or "condition", "value": condition_value}


def _public_conditions(item: dict[str, Any]) -> list[dict[str, Any]]:
    conditions: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    for key, kind in (
        ("conditions", "condition"),
        ("wait_conditions", "wait"),
    ):
        raw = item.get(key)
        if isinstance(raw, list):
            for entry in raw:
                normalized = _normalize_condition(entry)
                if normalized is None:
                    continue
                identity = (normalized["kind"], normalized["value"])
                if identity in seen:
                    continue
                seen.add(identity)
                conditions.append(normalized)

    for key in ("retry_reason", "last_error", "linear_sync_error"):
        raw_value = str(item.get(key) or "").strip()
        if not raw_value:
            continue
        normalized = {"kind": key, "value": raw_value}
        identity = (normalized["kind"], normalized["value"])
        if identity in seen:
            continue
        seen.add(identity)
        conditions.append(normalized)

    return conditions


def public_state(claim_state: str) -> str:
    return PUBLIC_STATE_MAP.get(claim_state, claim_state or "needs_attention")


def public_item(item: dict[str, Any]) -> dict[str, Any]:
    state = public_state(str(item.get("claim_state") or ""))
    public: dict[str, Any] = {
        "issue_identifier": str(item.get("issue_identifier") or item.get("identifier") or ""),
        "state": state,
        "workspace_path": str(item.get("workspace_path") or ""),
        "queued_by": str(item.get("claimed_by") or ""),
        "updated_at": str(item.get("updated_at") or ""),
        "attempt_count": int(item.get("attempt_count") or 0),
        "last_observed_issue_state_name": str(item.get("last_observed_issue_state_name") or ""),
        "last_observed_issue_state_type": str(item.get("last_observed_issue_state_type") or ""),
        "conditions": _public_conditions(item),
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
        "schema_version": payload.get("schema_version") or SCHEMA_VERSION,
        "config": payload.get("config") if isinstance(payload.get("config"), dict) else {},
        "items": items,
        "summary": public_summary(summary_items),
        "generated_at": payload.get("generated_at") or "",
    }


def discover_issue_ids(payload: dict[str, Any]) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()

    waves = payload.get("waves")
    if isinstance(waves, list):
        for wave in waves:
            if not isinstance(wave, dict):
                continue
            issues = wave.get("issues")
            if not isinstance(issues, list):
                continue
            for issue in issues:
                if not isinstance(issue, dict):
                    continue
                identifier = str(issue.get("issue_identifier") or issue.get("identifier") or "").strip()
                if identifier and identifier not in seen:
                    seen.add(identifier)
                    ids.append(identifier)

    if ids:
        return ids

    for item in _items(payload):
        identifier = str(item.get("issue_identifier") or item.get("identifier") or "").strip()
        if identifier and identifier not in seen:
            seen.add(identifier)
            ids.append(identifier)

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
