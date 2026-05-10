#!/usr/bin/env python3
"""Helpers for the standalone autobot-engine daemon."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from autobot_queue import public_item


ACTIVE_STATES = {"claimed", "running", "reconciling"}
RECOVERY_STATES = {"failed", "error", "stale"}
TERMINAL_STATES = {"released", "canceled"}
STATE_PRIORITY = {
    "queued": 0,
    "claimed": 1,
    "running": 2,
    "reconciling": 3,
    "failed": 4,
    "error": 4,
    "stale": 4,
}

TERMINAL_LINEAR_STATE_TYPES = {"canceled", "closed"}
SUCCESS_LINEAR_STATE_TYPES = {"completed", "done"}
RECONCILE_PR_STATES = {"OPEN"}


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


def _rollup_status_state(value: Any) -> str:
    if isinstance(value, dict):
        items: list[dict[str, Any]] = [value]
    elif isinstance(value, list):
        items = [item for item in value if isinstance(item, dict)]
    else:
        items = []

    seen_pending = False
    for item in items:
        check_run = _as_mapping(item.get("checkRun") or item.get("check_run"))
        state = str(
            item.get("state")
            or item.get("conclusion")
            or item.get("status")
            or check_run.get("state")
            or check_run.get("conclusion")
            or ""
        ).upper()

        if state in {"FAILURE", "FAILED", "ERROR", "CANCELLED", "CANCELED"}:
            return "FAILURE" if state in {"FAILURE", "FAILED"} else "ERROR"

        if state in {"PENDING", "IN_PROGRESS", "QUEUED"}:
            seen_pending = True

    return "PENDING" if seen_pending else ""


def _normalize_comment(entry: Any) -> dict[str, Any] | None:
    if not isinstance(entry, dict):
        return None

    author = _as_mapping(entry.get("author") or entry.get("user"))
    return {
        "id": entry.get("id"),
        "author": str(author.get("login") or author.get("name") or ""),
        "body": str(entry.get("body") or ""),
        "created_at": str(entry.get("createdAt") or entry.get("created_at") or ""),
        "path": str(entry.get("path") or ""),
        "line": entry.get("line"),
        "side": str(entry.get("side") or ""),
        "url": str(entry.get("url") or ""),
    }


def _normalize_review(entry: Any) -> dict[str, Any] | None:
    if not isinstance(entry, dict):
        return None

    author = _as_mapping(entry.get("author") or entry.get("user"))
    return {
        "author": str(author.get("login") or author.get("name") or ""),
        "body": str(entry.get("body") or ""),
        "created_at": str(entry.get("submittedAt") or entry.get("submitted_at") or ""),
        "state": str(entry.get("state") or "").upper(),
        "url": str(entry.get("url") or ""),
    }


def summarize_review_activity(payload: dict[str, Any]) -> dict[str, Any]:
    issue_comments = payload.get("issue_comments")
    review_comments = payload.get("review_comments")
    reviews = payload.get("reviews")

    return {
        "review_decision": str(payload.get("review_decision") or payload.get("reviewDecision") or "").upper(),
        "reviews": [normalized for item in (reviews if isinstance(reviews, list) else []) if (normalized := _normalize_review(item))],
        "top_level_comments": [normalized for item in (issue_comments if isinstance(issue_comments, list) else []) if (normalized := _normalize_comment(item))],
        "code_line_comments": [normalized for item in (review_comments if isinstance(review_comments, list) else []) if (normalized := _normalize_comment(item))],
    }


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

    for state in ("queued", "claimed", "running", "reconciling"):
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
    engine_mode: str,
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
    config = _as_mapping(queue_payload.get("config"))
    return {
        "schema_version": queue_payload.get("schema_version") or 1,
        "config": config,
        "engine": {
            "pid": pid,
            "running": running,
            "mode": engine_mode,
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
            "items": [public_item(item) for item in items],
            "selected_work": public_item(queue["selected"]) if queue["selected"] else None,
            "summary": queue["summary"],
        },
        "generated_at": _now(),
    }


def decide_recovery(payload: dict[str, Any]) -> dict[str, Any]:
    attempt_count = int(payload.get("attempt_count") or 0)
    max_attempts = int(payload.get("max_attempts") or 0)
    workspace_exists = bool(payload.get("workspace_exists"))
    claim_state = str(payload.get("claim_state") or "")

    linear = _as_mapping(payload.get("linear"))
    linear_item = _as_mapping(linear.get("item"))
    linear_status = _as_mapping(linear.get("status") or linear_item.get("status"))
    linear_issue = _as_mapping(linear.get("issue") or linear_item.get("issue"))
    pr = _as_mapping(payload.get("pr"))

    linear_state_type = str(
        linear.get("state_type")
        or linear.get("type")
        or linear_status.get("type")
        or linear_issue.get("state_type")
        or linear_issue.get("stateType")
        or ""
    ).lower()
    linear_state_name = str(
        linear.get("state_name")
        or linear.get("name")
        or linear_status.get("name")
        or linear_issue.get("state_name")
        or linear_issue.get("stateName")
        or ""
    ).lower()

    pr_state = str(pr.get("state") or pr.get("State") or "").upper()
    merge_state_status = str(pr.get("merge_state_status") or pr.get("mergeStateStatus") or "").upper()
    review_decision = str(pr.get("review_decision") or pr.get("reviewDecision") or "").upper()
    status_state = _rollup_status_state(pr.get("status_check_rollup") or pr.get("statusCheckRollup"))

    merge_conflict_count = int(payload.get("merge_conflict_count") or 0)
    workspace_dirty = bool(payload.get("workspace_dirty"))

    if linear_state_type in TERMINAL_LINEAR_STATE_TYPES or linear_state_name in TERMINAL_LINEAR_STATE_TYPES:
        return {"action": "cancel", "reason": f"linear-{linear_state_type or linear_state_name}"}

    if linear_state_type in SUCCESS_LINEAR_STATE_TYPES or linear_state_name in SUCCESS_LINEAR_STATE_TYPES:
        return {"action": "release", "reason": f"linear-{linear_state_type or linear_state_name}", "fetch_main": True, "cleanup_eligible": True}

    if pr_state == "MERGED" or merge_state_status == "MERGED":
        return {"action": "release", "reason": f"pr-{pr_state or merge_state_status}", "fetch_main": True, "cleanup_eligible": True}

    if merge_conflict_count > 0 or review_decision == "CHANGES_REQUESTED" or status_state in {"FAILURE", "ERROR"}:
        return {"action": "reconcile", "reason": "pr-ci-review-conflict"}

    if not workspace_exists:
        if max_attempts <= 0 or attempt_count < max_attempts:
            return {"action": "retry", "reason": "missing-workspace", "phase": "delivery"}
        return {"action": "stop", "reason": "missing-workspace-exhausted"}

    if claim_state in RECOVERY_STATES:
        if max_attempts <= 0 or attempt_count < max_attempts:
            return {"action": "retry", "reason": f"claim-{claim_state}", "phase": "delivery"}
        return {"action": "stop", "reason": f"claim-{claim_state}-exhausted"}

    if workspace_dirty and claim_state in ACTIVE_STATES:
        return {"action": "reconcile", "reason": "workspace-dirty"}

    return {"action": "continue", "reason": "no-recovery-needed"}


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
    render.add_argument("--current-mode", default="")
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

    recovery = subparsers.add_parser("decide-recovery")

    subparsers.add_parser("summarize-review-activity")

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
                    engine_mode=args.current_mode,
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

    if args.command == "decide-recovery":
        print(json.dumps(decide_recovery(payload)))
        return 0

    if args.command == "summarize-review-activity":
        print(json.dumps(summarize_review_activity(payload)))
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
