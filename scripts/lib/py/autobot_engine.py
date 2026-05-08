#!/usr/bin/env python3
"""Helpers for the standalone autobot-engine daemon."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ACTIVE_STATES = {"claimed", "running", "reconciling"}
RECOVERY_STATES = {"failed", "error", "stale"}
TERMINAL_STATES = {"released", "canceled"}
STATE_PRIORITY = {
    "claimed": 0,
    "running": 1,
    "reconciling": 2,
    "failed": 3,
    "error": 3,
    "stale": 3,
}


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _as_mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _items(payload: dict[str, Any]) -> list[dict[str, Any]]:
    items = payload.get("items")
    if not isinstance(items, list):
        items = payload.get("claims") if isinstance(payload.get("claims"), list) else []

    return [item for item in items if isinstance(item, dict)]


def _claim_state(item: dict[str, Any]) -> str:
    return str(item.get("claim_state") or "")


def _state_rank(state: str) -> int:
    return STATE_PRIORITY.get(state, 99)


def _queue_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    for item in items:
        state = _claim_state(item)
        counts[state] = counts.get(state, 0) + 1

    return {
        "total": len(items),
        "claimed": counts.get("claimed", 0),
        "running": counts.get("running", 0),
        "reconciling": counts.get("reconciling", 0),
        "recovery": sum(counts.get(state, 0) for state in RECOVERY_STATES),
        "terminal": sum(counts.get(state, 0) for state in TERMINAL_STATES),
        "by_state": counts,
    }


def select_work(payload: dict[str, Any], *, allow_recovery: bool = True) -> dict[str, Any]:
    items = _items(payload)
    selected: dict[str, Any] | None = None

    for state in ("claimed", "running", "reconciling"):
        for item in items:
            if _claim_state(item) == state:
                selected = item
                break
        if selected is not None:
            break

    if selected is None and allow_recovery:
        for item in items:
            if _claim_state(item) in RECOVERY_STATES:
                selected = item
                break

    return {
        "selected": selected,
        "summary": {
            **_queue_summary(items),
            "selected_issue_identifier": str(selected.get("issue_identifier") or "") if selected else "",
            "selected_state": _claim_state(selected) if selected else "",
            "allow_recovery": allow_recovery,
        },
    }


def discover_issue_ids(payload: dict[str, Any]) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()

    for item in _items(payload):
        identifier = str(item.get("issue_identifier") or item.get("identifier") or "").strip()
        if identifier and identifier not in seen:
            seen.add(identifier)
            ids.append(identifier)

    return ids


def render_status(
    *,
    pid: int | None,
    running: bool,
    lock_path: str,
    pid_path: str,
    log_path: str,
    status_path: str,
    queue_payload: dict[str, Any],
    current_issue: str = "",
    current_phase: str = "",
    current_attempt: int | None = None,
    last_tick_at: str | None = None,
) -> dict[str, Any]:
    queue = select_work(queue_payload)
    items = _items(queue_payload)
    return {
        "engine": {
            "pid": pid,
            "running": running,
            "current_issue": current_issue,
            "current_phase": current_phase,
            "current_attempt": current_attempt,
            "last_tick_at": last_tick_at or _now(),
        },
        "paths": {
            "lock": lock_path,
            "pid": pid_path,
            "log": log_path,
            "status": status_path,
        },
        "queue": {
            "items": items,
            "selected_work": queue["selected"],
            "summary": queue["summary"],
        },
        "generated_at": _now(),
    }


def append_event(path: str | Path, event: dict[str, Any]) -> None:
    event_path = Path(path)
    event_path.parent.mkdir(parents=True, exist_ok=True)
    with event_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(event, sort_keys=True) + "\n")


def _load_json_argument(raw_text: str, *, label: str) -> dict[str, Any]:
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive CLI path
        raise SystemExit(f"{label} must be valid JSON") from exc

    return _as_mapping(payload)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="autobot_engine.py")
    subparsers = parser.add_subparsers(dest="command", required=True)

    select = subparsers.add_parser("select-work")
    select.add_argument("--no-recovery", action="store_true")

    render = subparsers.add_parser("render-status")
    render.add_argument("--pid")
    render.add_argument("--running", action="store_true")
    render.add_argument("--lock-path", required=True)
    render.add_argument("--pid-path", required=True)
    render.add_argument("--log-path", required=True)
    render.add_argument("--status-path", required=True)
    render.add_argument("--current-issue", default="")
    render.add_argument("--current-phase", default="")
    render.add_argument("--current-attempt", type=int)
    render.add_argument("--last-tick-at", default="")

    event = subparsers.add_parser("append-event")
    event.add_argument("--path", required=True)
    event.add_argument("--event-json", required=True)

    discover = subparsers.add_parser("discover-ids")

    args = parser.parse_args(argv)
    payload = _load_json_argument(sys.stdin.read() or "{}", label="input payload")

    if args.command == "select-work":
        print(json.dumps(select_work(payload, allow_recovery=not args.no_recovery)))
        return 0

    if args.command == "render-status":
        pid = None
        if args.pid not in (None, ""):
            pid = int(args.pid)
        print(
            json.dumps(
                render_status(
                    pid=pid,
                    running=args.running,
                    lock_path=args.lock_path,
                    pid_path=args.pid_path,
                    log_path=args.log_path,
                    status_path=args.status_path,
                    queue_payload=payload,
                    current_issue=args.current_issue,
                    current_phase=args.current_phase,
                    current_attempt=args.current_attempt,
                    last_tick_at=args.last_tick_at or None,
                )
            )
        )
        return 0

    if args.command == "append-event":
        event_payload = _load_json_argument(args.event_json, label="event payload")
        append_event(args.path, event_payload)
        return 0

    if args.command == "discover-ids":
        print("\n".join(discover_issue_ids(payload)))
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
