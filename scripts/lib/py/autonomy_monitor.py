#!/usr/bin/env python3
"""Pure evaluator for autonomy monitor ticks."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Iterable
from typing import Any


ACTIVE_CLAIM_STATES = {"claimed", "running", "reconciling"}
TERMINAL_ISSUE_STATE_TYPES = {"completed", "canceled", "closed", "done"}
OPEN_STATE_NAMES = {"backlog", "todo"}
OPEN_STATE_TYPES = {"backlog", "todo"}
LOW_PRIORITY_SENTINEL = 1_000_000


def _as_mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _issue_identifier(issue: dict[str, Any]) -> str:
    identifier = issue.get("identifier") or issue.get("issue_identifier") or ""
    return str(identifier)


def _issue_priority(issue: dict[str, Any]) -> int:
    priority = issue.get("priority")
    if isinstance(priority, bool):
        return LOW_PRIORITY_SENTINEL
    if isinstance(priority, int):
        if priority <= 0:
            return LOW_PRIORITY_SENTINEL
        return priority
    if isinstance(priority, str) and priority.isdigit():
        value = int(priority)
        if value <= 0:
            return LOW_PRIORITY_SENTINEL
        return value
    return LOW_PRIORITY_SENTINEL


def _issue_state(issue: dict[str, Any]) -> dict[str, Any]:
    state = issue.get("state")
    if isinstance(state, dict):
        return state
    status = issue.get("status")
    if isinstance(status, dict):
        return status
    state_name = issue.get("state_name")
    state_type = issue.get("state_type")
    if state_name is None:
        state_name = issue.get("status_name")
    if state_type is None:
        state_type = issue.get("status_type")
    if state_name is None and state_type is None:
        return {}
    return {"name": state_name, "type": state_type}


def _project_name(issue: dict[str, Any]) -> str:
    project = issue.get("project")
    if isinstance(project, dict):
        return str(project.get("name") or "")
    return str(issue.get("project_name") or issue.get("projectName") or "")


def _collect_blockers(issue: dict[str, Any]) -> list[dict[str, Any]]:
    blockers: list[dict[str, Any]] = []
    candidates: Iterable[Any] = ()

    relations = issue.get("relations")
    if isinstance(relations, dict):
        blocked_by = relations.get("blockedBy")
        if isinstance(blocked_by, list):
            candidates = blocked_by
        elif isinstance(blocked_by, dict):
            nodes = blocked_by.get("nodes")
            if isinstance(nodes, list):
                candidates = nodes

    if not candidates:
        for key in ("blockers", "blockingIssues", "blockedBy", "blocked_by"):
            value = issue.get(key)
            if isinstance(value, list):
                candidates = value
                break
            if isinstance(value, dict):
                nodes = value.get("nodes")
                if isinstance(nodes, list):
                    candidates = nodes
                    break

    for candidate in candidates:
        if isinstance(candidate, dict):
            blockers.append(candidate)
    return blockers


def _blocker_state_type(blocker: dict[str, Any]) -> str:
    state = blocker.get("state")
    if isinstance(state, dict):
        state_type = state.get("type")
        if state_type:
            return str(state_type)
    status = blocker.get("status")
    if isinstance(status, dict):
        state_type = status.get("type")
        if state_type:
            return str(state_type)
    state_type = blocker.get("state_type") or blocker.get("stateType")
    return str(state_type or "")


def _blocker_identifier(blocker: dict[str, Any]) -> str:
    identifier = blocker.get("identifier") or blocker.get("issue_identifier") or blocker.get("id") or ""
    return str(identifier)


def _claim_is_active(claim: dict[str, Any]) -> bool:
    return str(claim.get("claim_state") or "") in ACTIVE_CLAIM_STATES


def _claims_by_identifier(claim_payload: Any) -> dict[str, dict[str, Any]]:
    if isinstance(claim_payload, dict):
        candidates = claim_payload.get("items")
        if not isinstance(candidates, list):
            candidates = claim_payload.get("claims")
        if not isinstance(candidates, list):
            candidates = []
    elif isinstance(claim_payload, list):
        candidates = claim_payload
    else:
        candidates = []

    result: dict[str, dict[str, Any]] = {}
    for claim in candidates:
        if isinstance(claim, dict):
            identifier = str(claim.get("issue_identifier") or claim.get("identifier") or "")
            if identifier:
                result[identifier] = claim
    return result


def _is_open_state(issue: dict[str, Any]) -> tuple[bool, str | None]:
    state = _issue_state(issue)
    state_name = str(state.get("name") or "")
    state_type = str(state.get("type") or "")
    if state_name.lower() not in OPEN_STATE_NAMES and state_type.lower() not in OPEN_STATE_TYPES:
        descriptor = state_name or state_type or "unknown"
        return False, f"state:{descriptor}"

    return True, None


def _normalize_project_scope(project_scope: Iterable[str] | None) -> list[str] | None:
    if project_scope is None:
        return None

    normalized: list[str] = []
    seen: set[str] = set()
    for project_name in project_scope:
        cleaned = str(project_name).strip()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            normalized.append(cleaned)

    if not normalized:
        return None

    return sorted(normalized)


def evaluate_monitor_candidates(
    payload: dict[str, Any],
    *,
    limit: int | None = None,
    claimed_by: str | None = None,
    prepare: bool = False,
    project_scope: list[str] | None = None,
) -> dict[str, Any]:
    issues = payload.get("issues")
    if not isinstance(issues, list):
        issues = payload.get("items") if isinstance(payload.get("items"), list) else []
    claim_map = _claims_by_identifier(payload.get("claims", {}))
    normalized_project_scope = _normalize_project_scope(project_scope)
    project_scope_set = set(normalized_project_scope or [])

    items: list[dict[str, Any]] = []
    for raw_issue in issues:
        if not isinstance(raw_issue, dict):
            continue

        identifier = _issue_identifier(raw_issue)
        project_name = _project_name(raw_issue)

        if project_scope_set and project_name not in project_scope_set:
            continue

        state = _issue_state(raw_issue)
        blockers = _collect_blockers(raw_issue)
        claim = claim_map.get(identifier)

        reasons: list[str] = []
        notes: list[str] = []

        if not identifier:
            reasons.append("missing-identifier")

        open_state, scope_reason = _is_open_state(raw_issue)
        if not open_state and scope_reason is not None:
            reasons.append(scope_reason)

        if claim is not None and _claim_is_active(claim):
            reasons.append("active-claim")

        blocker_ids = [_blocker_identifier(blocker) for blocker in blockers if _blocker_identifier(blocker)]
        blocking_ids: list[str] = []
        terminal_blockers: list[str] = []
        for blocker in blockers:
            blocker_identifier = _blocker_identifier(blocker)
            if not blocker_identifier:
                continue
            blocker_state_type = _blocker_state_type(blocker).lower()
            if blocker_state_type in TERMINAL_ISSUE_STATE_TYPES:
                terminal_blockers.append(blocker_identifier)
            else:
                blocking_ids.append(blocker_identifier)

        if blocking_ids:
            reasons.append("blocked-by:" + ",".join(sorted(blocking_ids)))
        elif blocker_ids and terminal_blockers:
            notes.append("terminal-blockers-ignored")

        eligible = not reasons
        action = "prepare" if eligible and prepare else "observe"

        items.append(
            {
                "issue_identifier": identifier,
                "priority": _issue_priority(raw_issue),
                "project_name": project_name,
                "state_name": str(state.get("name") or ""),
                "state_type": str(state.get("type") or ""),
                "claim_state": claim.get("claim_state") if isinstance(claim, dict) else None,
                "eligible": eligible,
                "action": action,
                "reasons": reasons,
                "notes": notes,
                "blockers": blocker_ids,
                "claimed_by": claimed_by,
            }
        )

    items.sort(key=lambda item: (item["priority"], item["issue_identifier"]))
    if limit is not None:
        items = items[:limit]

    eligible_count = sum(1 for item in items if item["eligible"])
    return {
        "items": items,
        "summary": {
            "scanned_count": len(issues),
            "eligible_count": eligible_count,
            "blocked_count": len(items) - eligible_count,
            "limit": limit,
            "prepare": prepare,
            "project_scope": normalized_project_scope,
        },
    }


def _render_text(result: dict[str, Any]) -> str:
    lines = ["MONITOR"]
    items = result.get("items", [])
    if not isinstance(items, list) or not items:
        lines.append("  (none)")
        return "\n".join(lines)

    for item in items:
        if not isinstance(item, dict):
            continue
        flags = ["eligible" if item.get("eligible") else "blocked"]
        if item.get("action"):
            flags.append(f"action={item['action']}")
        if item.get("reasons"):
            flags.append(f"reasons={','.join(item['reasons'])}")
        if item.get("notes"):
            flags.append(f"notes={','.join(item['notes'])}")
        lines.append(
            f"  {item.get('issue_identifier', '')}  priority={item.get('priority', '')}  "
            + "  ".join(flags)
        )
    return "\n".join(lines)


def _load_payload(text: str | None = None) -> dict[str, Any]:
    if text is None:
        return json.load(sys.stdin)
    return json.loads(text)


def main(argv: list[str] | None = None, *, input_text: str | None = None) -> int:
    parser = argparse.ArgumentParser(prog="autonomy_monitor.py")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--claimed-by")
    parser.add_argument("--project", action="append")
    parser.add_argument("--prepare", action="store_true")
    args = parser.parse_args(argv)

    payload = _load_payload(input_text)
    result = evaluate_monitor_candidates(
        payload,
        limit=args.limit,
        claimed_by=args.claimed_by,
        prepare=args.prepare,
        project_scope=args.project,
    )

    if args.json:
        print(json.dumps(result))
    else:
        print(_render_text(result))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
