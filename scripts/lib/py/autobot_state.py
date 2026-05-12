#!/usr/bin/env python3
"""Durable local state for autobot orchestration."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
ACTIVE_STATES = {"claimed", "running", "reconciling"}
QUEUED_STATES = {"queued", "claimed", "running", "reconciling", "failed", "error", "stale"}
TERMINAL_STATES = {"released", "stale", "canceled"}
TERMINAL_ISSUE_STATE_TYPES = {"completed", "canceled", "closed", "done"}
RETRYABLE_STATES = {"released", "stale", "canceled", "failed", "error"}
FAILED_RUN_STATES = {"failed", "error", "canceled"}
SYNC_ERROR_STATES = {"released", "stale", "canceled", "failed", "error"}


def _claim_sync_error(item: dict[str, Any]) -> str | None:
    state_error = item.get("linear_state_sync_error")
    assignment_error = item.get("linear_assignment_sync_error")
    sync_error = item.get("linear_sync_error")
    if state_error:
        return str(state_error)
    if assignment_error:
        return str(assignment_error)
    if sync_error:
        return str(sync_error)
    return None


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def _row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def _commonpath(a: Path, b: Path) -> Path:
    return Path(os.path.commonpath([str(a), str(b)]))


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {row["name"] for row in rows}


def _ensure_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    existing = _table_columns(conn, table)
    for column, definition in columns.items():
        if column in existing:
            continue
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _count_by_state(items: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        state = str(item.get("claim_state", ""))
        counts[state] = counts.get(state, 0) + 1
    return counts


def _status_recent_errors(
    items: list[dict[str, Any]], runs: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []

    for run in runs:
        last_error = run.get("last_error")
        if not last_error:
            continue
        errors.append(
            {
                "kind": "run",
                "issue_identifier": run.get("issue_identifier", ""),
                "attempt": run.get("attempt"),
                "message": last_error,
                "occurred_at": run.get("finished_at") or run.get("started_at") or "",
            }
        )

    for item in items:
        retry_reason = item.get("retry_reason")
        sync_error = _claim_sync_error(item)
        last_error = item.get("last_error")
        if sync_error:
            errors.append(
                {
                    "kind": "sync",
                    "issue_identifier": item.get("issue_identifier", ""),
                    "message": sync_error,
                    "occurred_at": item.get("linear_synced_at") or item.get("updated_at") or "",
                }
            )
        elif last_error:
            errors.append(
                {
                    "kind": "claim",
                    "issue_identifier": item.get("issue_identifier", ""),
                    "message": last_error,
                    "occurred_at": item.get("last_error_at") or item.get("updated_at") or "",
                }
            )
        elif retry_reason and item.get("claim_state") in SYNC_ERROR_STATES:
            errors.append(
                {
                    "kind": "reconcile",
                    "issue_identifier": item.get("issue_identifier", ""),
                    "message": retry_reason,
                    "occurred_at": item.get("updated_at") or "",
                }
            )

    errors.sort(key=lambda item: item.get("occurred_at", ""), reverse=True)
    return errors[:10]


class ActiveClaimError(RuntimeError):
    def __init__(self, existing_claim: dict[str, Any]):
        super().__init__("existing claim")
        self.existing_claim = existing_claim


class AutobotStore:
    def __init__(
        self,
        db_path: str | Path,
        main_checkout: str | Path,
        workspace_root: str | Path | None = None,
    ):
        self.db_path = Path(db_path)
        self.main_checkout = Path(main_checkout).resolve()
        self.workspace_root = Path(workspace_root or self.main_checkout.parent).resolve()
        self.allowed_root = self.workspace_root
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS claims (
                    issue_id TEXT NOT NULL,
                    issue_identifier TEXT PRIMARY KEY,
                    claim_state TEXT NOT NULL,
                    workspace_path TEXT NOT NULL,
                    phase TEXT NOT NULL,
                    attempt_count INTEGER NOT NULL DEFAULT 0,
                    retry_state TEXT,
                    retry_after TEXT,
                    retry_reason TEXT,
                    last_observed_issue_state_name TEXT,
                    last_observed_issue_state_type TEXT,
                    claimed_by TEXT,
                    claimed_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    released_at TEXT
                );

                CREATE TABLE IF NOT EXISTS runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    issue_identifier TEXT NOT NULL,
                    attempt INTEGER NOT NULL,
                    phase TEXT NOT NULL,
                    state TEXT NOT NULL,
                    workspace_path TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    finished_at TEXT,
                    last_error TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_runs_issue_attempt
                    ON runs(issue_identifier, attempt);
                CREATE INDEX IF NOT EXISTS idx_claims_state
                    ON claims(claim_state);
                """
            )
            _ensure_columns(
                conn,
                "claims",
                {
                    "canceled_at": "TEXT",
                    "last_error": "TEXT",
                    "last_error_at": "TEXT",
                    "linear_synced_at": "TEXT",
                    "linear_assignment_owned": "INTEGER NOT NULL DEFAULT 0",
                    "linear_state_sync_error": "TEXT",
                    "linear_assignment_sync_error": "TEXT",
                    "linear_sync_error": "TEXT",
                },
            )

    def _validate_workspace_path(self, workspace_path: str) -> str:
        path = Path(workspace_path)
        if not path.is_absolute():
            raise ValueError("workspace path must be absolute")

        resolved = path.resolve(strict=False)
        if _commonpath(resolved, self.allowed_root) != self.allowed_root:
            raise ValueError("workspace path must stay under the workspace root")

        return str(resolved)

    def _claim_row(self, conn: sqlite3.Connection, issue_identifier: str) -> sqlite3.Row | None:
        return conn.execute(
            "SELECT * FROM claims WHERE issue_identifier = ?",
            (issue_identifier,),
        ).fetchone()

    def _claim_dict(self, conn: sqlite3.Connection, issue_identifier: str) -> dict[str, Any] | None:
        return _row_to_dict(self._claim_row(conn, issue_identifier))

    def claim(
        self,
        *,
        issue_identifier: str,
        issue_id: str,
        workspace_path: str,
        phase: str,
        issue_state_name: str,
        issue_state_type: str,
        claimed_by: str | None = None,
    ) -> dict[str, Any]:
        workspace_path = self._validate_workspace_path(workspace_path)
        now = _now()
        claimed_by = claimed_by or os.environ.get("USER", "unknown")

        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            existing = self._claim_row(conn, issue_identifier)
            if existing is not None and existing["claim_state"] in ACTIVE_STATES:
                raise ActiveClaimError(_row_to_dict(existing) or {})

            payload = {
                "issue_id": issue_id,
                "issue_identifier": issue_identifier,
                "claim_state": "claimed",
                "workspace_path": workspace_path,
                "phase": phase,
                "attempt_count": 0,
                "retry_state": None,
                "retry_after": None,
                "retry_reason": None,
                "canceled_at": None,
                "last_error": None,
                "last_error_at": None,
                "linear_synced_at": None,
                "linear_assignment_owned": 0,
                "linear_state_sync_error": None,
                "linear_assignment_sync_error": None,
                "linear_sync_error": None,
                "last_observed_issue_state_name": issue_state_name,
                "last_observed_issue_state_type": issue_state_type,
                "claimed_by": claimed_by,
                "claimed_at": now,
                "updated_at": now,
                "released_at": None,
            }

            if existing is None:
                conn.execute(
                    """
                    INSERT INTO claims (
                        issue_id, issue_identifier, claim_state, workspace_path, phase,
                        attempt_count, retry_state, retry_after, retry_reason, canceled_at,
                        last_error, last_error_at, linear_synced_at,
                        linear_assignment_owned, linear_state_sync_error,
                        linear_assignment_sync_error, linear_sync_error,
                        last_observed_issue_state_name, last_observed_issue_state_type,
                        claimed_by, claimed_at, updated_at, released_at
                    ) VALUES (
                        :issue_id, :issue_identifier, :claim_state, :workspace_path, :phase,
                        :attempt_count, :retry_state, :retry_after, :retry_reason, :canceled_at,
                        :last_error, :last_error_at, :linear_synced_at,
                        :linear_assignment_owned, :linear_state_sync_error,
                        :linear_assignment_sync_error, :linear_sync_error,
                        :last_observed_issue_state_name, :last_observed_issue_state_type,
                        :claimed_by, :claimed_at, :updated_at, :released_at
                    )
                    """,
                    payload,
                )
            else:
                conn.execute(
                    """
                    UPDATE claims SET
                        issue_id = :issue_id,
                        claim_state = :claim_state,
                        workspace_path = :workspace_path,
                        phase = :phase,
                        attempt_count = :attempt_count,
                        retry_state = :retry_state,
                        retry_after = :retry_after,
                        retry_reason = :retry_reason,
                        canceled_at = :canceled_at,
                        last_error = :last_error,
                        last_error_at = :last_error_at,
                        linear_synced_at = :linear_synced_at,
                        linear_assignment_owned = :linear_assignment_owned,
                        linear_state_sync_error = :linear_state_sync_error,
                        linear_assignment_sync_error = :linear_assignment_sync_error,
                        linear_sync_error = :linear_sync_error,
                        last_observed_issue_state_name = :last_observed_issue_state_name,
                        last_observed_issue_state_type = :last_observed_issue_state_type,
                        claimed_by = :claimed_by,
                        claimed_at = :claimed_at,
                        updated_at = :updated_at,
                        released_at = :released_at
                    WHERE issue_identifier = :issue_identifier
                    """,
                    payload,
                )

            claim = self._claim_dict(conn, issue_identifier)
            assert claim is not None
            return claim

    def queue(
        self,
        *,
        issue_identifier: str,
        issue_id: str,
        workspace_path: str,
        issue_state_name: str,
        issue_state_type: str,
        claimed_by: str | None = None,
    ) -> dict[str, Any]:
        workspace_path = self._validate_workspace_path(workspace_path)
        now = _now()
        claimed_by = claimed_by or os.environ.get("USER", "unknown")

        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            existing = self._claim_row(conn, issue_identifier)
            if existing is not None and str(existing["claim_state"]) in QUEUED_STATES:
                return _row_to_dict(existing) or {}

            payload = {
                "issue_id": issue_id,
                "issue_identifier": issue_identifier,
                "claim_state": "queued",
                "workspace_path": workspace_path,
                "phase": "queue",
                "attempt_count": 0,
                "retry_state": None,
                "retry_after": None,
                "retry_reason": None,
                "canceled_at": None,
                "last_error": None,
                "last_error_at": None,
                "linear_synced_at": None,
                "linear_assignment_owned": 0,
                "linear_state_sync_error": None,
                "linear_assignment_sync_error": None,
                "linear_sync_error": None,
                "last_observed_issue_state_name": issue_state_name,
                "last_observed_issue_state_type": issue_state_type,
                "claimed_by": claimed_by,
                "claimed_at": now,
                "updated_at": now,
                "released_at": None,
            }

            if existing is None:
                conn.execute(
                    """
                    INSERT INTO claims (
                        issue_id, issue_identifier, claim_state, workspace_path, phase,
                        attempt_count, retry_state, retry_after, retry_reason, canceled_at,
                        last_error, last_error_at, linear_synced_at,
                        linear_assignment_owned, linear_state_sync_error,
                        linear_assignment_sync_error, linear_sync_error,
                        last_observed_issue_state_name, last_observed_issue_state_type,
                        claimed_by, claimed_at, updated_at, released_at
                    ) VALUES (
                        :issue_id, :issue_identifier, :claim_state, :workspace_path, :phase,
                        :attempt_count, :retry_state, :retry_after, :retry_reason, :canceled_at,
                        :last_error, :last_error_at, :linear_synced_at,
                        :linear_assignment_owned, :linear_state_sync_error,
                        :linear_assignment_sync_error, :linear_sync_error,
                        :last_observed_issue_state_name, :last_observed_issue_state_type,
                        :claimed_by, :claimed_at, :updated_at, :released_at
                    )
                    """,
                    payload,
                )
            else:
                conn.execute(
                    """
                    UPDATE claims SET
                        issue_id = :issue_id,
                        claim_state = :claim_state,
                        workspace_path = :workspace_path,
                        phase = :phase,
                        attempt_count = :attempt_count,
                        retry_state = :retry_state,
                        retry_after = :retry_after,
                        retry_reason = :retry_reason,
                        canceled_at = :canceled_at,
                        last_error = :last_error,
                        last_error_at = :last_error_at,
                        linear_synced_at = :linear_synced_at,
                        linear_assignment_owned = :linear_assignment_owned,
                        linear_state_sync_error = :linear_state_sync_error,
                        linear_assignment_sync_error = :linear_assignment_sync_error,
                        linear_sync_error = :linear_sync_error,
                        last_observed_issue_state_name = :last_observed_issue_state_name,
                        last_observed_issue_state_type = :last_observed_issue_state_type,
                        claimed_by = :claimed_by,
                        claimed_at = :claimed_at,
                        updated_at = :updated_at,
                        released_at = :released_at
                    WHERE issue_identifier = :issue_identifier
                    """,
                    payload,
                )

            claim = self._claim_dict(conn, issue_identifier)
            assert claim is not None
            return claim

    def release(self, issue_identifier: str, reason: str = "") -> dict[str, Any]:
        now = _now()
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            existing = self._claim_row(conn, issue_identifier)
            if existing is None:
                raise ValueError(f"unknown claim: {issue_identifier}")
            conn.execute(
                """
                UPDATE claims SET
                    claim_state = 'released',
                    retry_state = 'released',
                    retry_reason = ?,
                    released_at = ?,
                    updated_at = ?
                WHERE issue_identifier = ?
                """,
                (reason, now, now, issue_identifier),
            )
            claim = self._claim_dict(conn, issue_identifier)
            assert claim is not None
            return claim

    def cancel(self, issue_identifier: str, reason: str = "") -> dict[str, Any]:
        now = _now()
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            existing = self._claim_row(conn, issue_identifier)
            if existing is None:
                raise ValueError(f"unknown claim: {issue_identifier}")
            conn.execute(
                """
                UPDATE claims SET
                    claim_state = 'canceled',
                    retry_state = 'canceled',
                    retry_reason = ?,
                    canceled_at = ?,
                    updated_at = ?
                WHERE issue_identifier = ?
                """,
                (reason, now, now, issue_identifier),
            )
            claim = self._claim_dict(conn, issue_identifier)
            assert claim is not None
            return claim

    def retry(self, issue_identifier: str, reason: str = "") -> dict[str, Any]:
        now = _now()
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            existing = self._claim_row(conn, issue_identifier)
            if existing is None:
                raise ValueError(f"unknown claim: {issue_identifier}")
            if str(existing["claim_state"]) not in RETRYABLE_STATES:
                raise ValueError(f"claim is not retryable: {issue_identifier}")
            conn.execute(
                """
                UPDATE claims SET
                    claim_state = 'released',
                    retry_state = NULL,
                    retry_reason = NULL,
                    last_error = NULL,
                    last_error_at = NULL,
                    canceled_at = NULL,
                    linear_assignment_owned = 0,
                    linear_state_sync_error = NULL,
                    linear_assignment_sync_error = NULL,
                    linear_sync_error = NULL,
                    linear_synced_at = NULL,
                    released_at = ?,
                    updated_at = ?
                WHERE issue_identifier = ?
                """,
                (now, now, issue_identifier),
            )
            if reason:
                conn.execute(
                    "UPDATE claims SET retry_reason = ? WHERE issue_identifier = ?",
                    (reason, issue_identifier),
                )
            claim = self._claim_dict(conn, issue_identifier)
            assert claim is not None
            return claim

    def record_sync(
        self,
        issue_identifier: str,
        *,
        kind: str = "state",
        ok: bool,
        error: str | None = None,
        assignment_owned: bool | None = None,
    ) -> dict[str, Any]:
        now = _now()
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            existing = self._claim_row(conn, issue_identifier)
            if existing is None:
                raise ValueError(f"unknown claim: {issue_identifier}")
            state_error = existing["linear_state_sync_error"]
            assignment_error = existing["linear_assignment_sync_error"]
            owned = int(existing["linear_assignment_owned"] or 0)

            if kind == "state":
                state_error = None if ok else (error or "sync failed")
            elif kind == "assignment":
                assignment_error = None if ok else (error or "sync failed")
                if assignment_owned is not None and ok:
                    owned = 1 if assignment_owned else 0
            else:
                raise ValueError(f"unknown sync kind: {kind}")

            sync_error = state_error or assignment_error
            conn.execute(
                """
                UPDATE claims SET
                    linear_synced_at = ?,
                    linear_assignment_owned = ?,
                    linear_state_sync_error = ?,
                    linear_assignment_sync_error = ?,
                    linear_sync_error = ?,
                    updated_at = ?
                WHERE issue_identifier = ?
                """,
                (
                    now,
                    owned,
                    state_error,
                    assignment_error,
                    sync_error,
                    now,
                    issue_identifier,
                ),
            )
            claim = self._claim_dict(conn, issue_identifier)
            assert claim is not None
            return claim

    def run_start(self, issue_identifier: str, *, phase: str, workspace_path: str) -> dict[str, Any]:
        workspace_path = self._validate_workspace_path(workspace_path)
        now = _now()
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            claim = self._claim_row(conn, issue_identifier)
            if claim is None:
                raise ValueError(f"unknown claim: {issue_identifier}")

            attempt = int(claim["attempt_count"]) + 1
            conn.execute(
                """
                UPDATE claims SET
                    attempt_count = ?,
                    claim_state = 'running',
                    phase = ?,
                    workspace_path = ?,
                    updated_at = ?
                WHERE issue_identifier = ?
                """,
                (attempt, phase, workspace_path, now, issue_identifier),
            )
            conn.execute(
                """
                INSERT INTO runs (
                    issue_identifier, attempt, phase, state, workspace_path, started_at, finished_at, last_error
                ) VALUES (?, ?, ?, 'running', ?, ?, NULL, NULL)
                """,
                (issue_identifier, attempt, phase, workspace_path, now),
            )
            run = conn.execute(
                "SELECT * FROM runs WHERE issue_identifier = ? AND attempt = ?",
                (issue_identifier, attempt),
            ).fetchone()
            assert run is not None
            return _row_to_dict(run) or {}

    def run_finish(
        self,
        issue_identifier: str,
        *,
        attempt: int,
        state: str,
        last_error: str | None,
    ) -> dict[str, Any]:
        now = _now()
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """
                UPDATE runs SET
                    state = ?,
                    finished_at = ?,
                    last_error = ?
                WHERE issue_identifier = ? AND attempt = ?
                """,
                (state, now, last_error, issue_identifier, attempt),
            )
            run = conn.execute(
                "SELECT * FROM runs WHERE issue_identifier = ? AND attempt = ?",
                (issue_identifier, attempt),
            ).fetchone()
            if run is None:
                raise ValueError(f"unknown run: {issue_identifier}#{attempt}")

            if state in FAILED_RUN_STATES:
                conn.execute(
                    """
                    UPDATE claims SET
                        claim_state = ?,
                        retry_state = ?,
                        retry_reason = ?,
                        last_error = ?,
                        last_error_at = ?,
                        updated_at = ?
                    WHERE issue_identifier = ?
                    """,
                    (
                        state,
                        state,
                        last_error or state,
                        last_error or state,
                        now,
                        now,
                        issue_identifier,
                    ),
                )

            return _row_to_dict(run) or {}

    def reconcile(
        self,
        issue_identifier: str | None = None,
        *,
        issue_state_name: str | None = None,
        issue_state_type: str | None = None,
        all_claims: bool = False,
    ) -> list[dict[str, Any]]:
        now = _now()
        with self._connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            if all_claims:
                rows = conn.execute("SELECT * FROM claims ORDER BY claimed_at ASC").fetchall()
            elif issue_identifier is not None:
                row = self._claim_row(conn, issue_identifier)
                rows = [row] if row is not None else []
            else:
                rows = []

            updated: list[dict[str, Any]] = []
            for row in rows:
                if row is None:
                    continue

                workspace = Path(row["workspace_path"])
                claim_state = row["claim_state"]
                retry_reason: str | None = row["retry_reason"]
                retry_state: str | None = row["retry_state"]

                if claim_state == "canceled" and not all_claims:
                    continue

                should_stale = False
                if not workspace.exists():
                    should_stale = True
                    retry_state = "stale"
                    retry_reason = "missing-workspace"
                elif issue_state_type and issue_state_type in TERMINAL_ISSUE_STATE_TYPES:
                    should_stale = True
                    retry_state = "stale"
                    retry_reason = f"terminal-issue-state:{issue_state_type}"

                should_update_observed = issue_state_name is not None or issue_state_type is not None

                if (should_stale or should_update_observed) and claim_state not in TERMINAL_STATES:
                    next_state = claim_state
                    next_retry_state = retry_state
                    next_retry_reason = retry_reason
                    if should_stale:
                        next_state = 'stale'
                        next_retry_state = 'stale'
                        next_retry_reason = retry_reason

                    conn.execute(
                        """
                        UPDATE claims SET
                            claim_state = ?,
                            retry_state = ?,
                            retry_reason = ?,
                            last_observed_issue_state_name = COALESCE(?, last_observed_issue_state_name),
                            last_observed_issue_state_type = COALESCE(?, last_observed_issue_state_type),
                            updated_at = ?
                        WHERE issue_identifier = ?
                        """,
                        (
                            next_state,
                            next_retry_state,
                            next_retry_reason,
                            issue_state_name,
                            issue_state_type,
                            now,
                            row["issue_identifier"],
                        ),
                    )

                fresh = self._claim_dict(conn, row["issue_identifier"])
                if fresh is not None:
                    updated.append(fresh)

            return updated

    def status(self, *, all_claims: bool = False) -> dict[str, Any]:
        with self._connect() as conn:
            all_items = conn.execute("SELECT * FROM claims ORDER BY claimed_at ASC").fetchall()
            runs = conn.execute(
                "SELECT * FROM runs ORDER BY started_at ASC, id ASC"
            ).fetchall()
            all_items_dict = [dict(row) for row in all_items]
            items_dict = (
                all_items_dict
                if all_claims
                else [
                    item
                    for item in all_items_dict
                    if item.get("claim_state") not in {"released", "canceled"}
                    or _claim_sync_error(item)
                ]
            )
            runs_dict = [dict(row) for row in runs]
            summary_items = all_items_dict
            return {
                "schema_version": SCHEMA_VERSION,
                "items": items_dict,
                "runs": runs_dict,
                "summary": {
                    "claim_states": _count_by_state(summary_items),
                    "active_runs": sum(1 for run in runs_dict if run.get("state") == "running"),
                    "stale_claims": sum(1 for item in summary_items if item.get("claim_state") == "stale"),
                    "failed_runs": sum(1 for run in runs_dict if run.get("state") in FAILED_RUN_STATES),
                    "sync_errors": sum(1 for item in summary_items if item.get("linear_sync_error")),
                },
                "recent_errors": _status_recent_errors(summary_items, runs_dict),
                "generated_at": _now(),
            }


def _resolve_db_path(args: argparse.Namespace) -> Path:
    if args.db:
        return Path(args.db)
    if os.environ.get("REPRO_AUTOBOT_DB"):
        return Path(os.environ["REPRO_AUTOBOT_DB"])
    main_checkout = Path(args.main_checkout or os.environ.get("MAIN_CHECKOUT", os.getcwd()))
    return main_checkout / ".autobot" / "state.sqlite"


def _resolve_main_checkout(args: argparse.Namespace) -> Path:
    if args.main_checkout:
        return Path(args.main_checkout)
    return Path(os.environ.get("MAIN_CHECKOUT", os.getcwd()))


def _resolve_workspace_root(args: argparse.Namespace, main_checkout: Path) -> Path:
    if args.workspace_root:
        return Path(args.workspace_root)
    if os.environ.get("REPRO_WORKSPACE_ROOT"):
        return Path(os.environ["REPRO_WORKSPACE_ROOT"])
    return main_checkout.parent


def _json_dump(data: Any) -> None:
    print(json.dumps(data))


def _render_table(headers: tuple[str, ...], rows: list[tuple[str, ...]]) -> str:
    if not rows:
        return "  (none)"

    widths = [max(len(row[idx]) for row in rows + [headers]) for idx in range(len(headers))]
    lines = [
        "  "
        + "  ".join(headers[idx].ljust(widths[idx]) for idx in range(len(headers)))
    ]
    for row in rows:
        lines.append(
            "  "
            + "  ".join(row[idx].ljust(widths[idx]) for idx in range(len(headers)))
        )
    return "\n".join(lines)


def _status_table(items: list[dict[str, Any]], runs: list[dict[str, Any]]) -> str:
    claim_rows = [
        (
            str(item.get("issue_identifier", "")),
            str(item.get("claim_state", "")),
            str(item.get("phase", "")),
            str(item.get("attempt_count", 0)),
            str(item.get("claimed_by", "")),
            str(item.get("updated_at", "")),
            str(item.get("workspace_path", "")),
            str(
                item.get("retry_reason")
                or item.get("last_error")
                or item.get("linear_sync_error")
                or item.get("retry_state")
                or ""
            ),
        )
        for item in items
    ]
    run_rows = [
        (
            str(run.get("issue_identifier", "")),
            str(run.get("attempt", "")),
            str(run.get("phase", "")),
            str(run.get("state", "")),
            str(run.get("started_at", "")),
            str(run.get("finished_at", "")),
            str(run.get("workspace_path", "")),
            str(run.get("last_error") or ""),
        )
        for run in runs
    ]

    lines = [
        "CLAIMS",
        _render_table(
            (
                "ISSUE",
                "STATE",
                "PHASE",
                "ATTEMPT",
                "CLAIMED BY",
                "UPDATED",
                "WORKSPACE",
                "REASON",
            ),
            claim_rows,
        ),
    ]
    lines.extend([
        "",
        "RUNS",
        _render_table(
            ("ISSUE", "ATTEMPT", "PHASE", "STATE", "STARTED", "FINISHED", "WORKSPACE", "ERROR"),
            run_rows,
        ),
    ])
    return "\n".join(lines)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="autobot_state.py")
    parser.add_argument("--db")
    parser.add_argument("--main-checkout")
    parser.add_argument("--workspace-root")
    parser.add_argument("--json", action="store_true")

    subparsers = parser.add_subparsers(dest="command", required=True)

    status = subparsers.add_parser("status")
    status.add_argument("--all", action="store_true")

    claim = subparsers.add_parser("claim")
    claim.add_argument("issue_identifier")
    claim.add_argument("--issue-id", required=True)
    claim.add_argument("--workspace", required=True)
    claim.add_argument("--phase", required=True)
    claim.add_argument("--issue-state", required=True)
    claim.add_argument("--issue-state-type", default="started")
    claim.add_argument("--claimed-by")

    release = subparsers.add_parser("release")
    release.add_argument("issue_identifier")
    release.add_argument("--reason", default="")

    cancel = subparsers.add_parser("cancel")
    cancel.add_argument("issue_identifier")
    cancel.add_argument("--reason", default="")

    retry = subparsers.add_parser("retry")
    retry.add_argument("issue_identifier")
    retry.add_argument("--reason", default="")

    sync = subparsers.add_parser("sync")
    sync.add_argument("issue_identifier")
    sync.add_argument("--kind", default="state")
    sync.add_argument("--ok", action="store_true")
    sync.add_argument("--error")
    sync.add_argument("--assignment-owned")

    reconcile = subparsers.add_parser("reconcile")
    reconcile.add_argument("issue_identifier", nargs="?")
    reconcile.add_argument("--all", action="store_true")
    reconcile.add_argument("--issue-state-name")
    reconcile.add_argument("--issue-state-type")

    queue = subparsers.add_parser("queue")
    queue.add_argument("issue_identifier")
    queue.add_argument("--issue-id", required=True)
    queue.add_argument("--workspace", required=True)
    queue.add_argument("--issue-state", required=True)
    queue.add_argument("--issue-state-type", default="unstarted")
    queue.add_argument("--claimed-by")

    run = subparsers.add_parser("run")
    run_sub = run.add_subparsers(dest="run_command", required=True)

    run_start = run_sub.add_parser("start")
    run_start.add_argument("issue_identifier")
    run_start.add_argument("--phase", required=True)
    run_start.add_argument("--workspace", required=True)

    run_finish = run_sub.add_parser("finish")
    run_finish.add_argument("issue_identifier")
    run_finish.add_argument("--attempt", type=int, required=True)
    run_finish.add_argument("--state", required=True)
    run_finish.add_argument("--error")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    db_path = _resolve_db_path(args)
    main_checkout = _resolve_main_checkout(args)
    workspace_root = _resolve_workspace_root(args, main_checkout)
    store = AutobotStore(
        db_path=db_path,
        main_checkout=main_checkout,
        workspace_root=workspace_root,
    )

    try:
        if args.command == "status":
            result = store.status(all_claims=args.all)
            if args.json:
                _json_dump(result)
            else:
                print(_status_table(result["items"], result["runs"]))
            return 0

        if args.command == "claim":
            result = store.claim(
                issue_identifier=args.issue_identifier,
                issue_id=args.issue_id,
                workspace_path=args.workspace,
                phase=args.phase,
                issue_state_name=args.issue_state,
                issue_state_type=args.issue_state_type,
                claimed_by=args.claimed_by,
            )
            if args.json:
                _json_dump({"claim": result})
            else:
                print(f"claimed {result['issue_identifier']}")
            return 0

        if args.command == "queue":
            result = store.queue(
                issue_identifier=args.issue_identifier,
                issue_id=args.issue_id,
                workspace_path=args.workspace,
                issue_state_name=args.issue_state,
                issue_state_type=args.issue_state_type,
                claimed_by=args.claimed_by,
            )
            if args.json:
                _json_dump({"claim": result})
            else:
                print(f"queued {result['issue_identifier']}")
            return 0

        if args.command == "release":
            result = store.release(args.issue_identifier, reason=args.reason)
            if args.json:
                _json_dump({"claim": result})
            else:
                print(f"released {result['issue_identifier']}")
            return 0

        if args.command == "cancel":
            result = store.cancel(args.issue_identifier, reason=args.reason)
            if args.json:
                _json_dump({"claim": result})
            else:
                print(f"canceled {result['issue_identifier']}")
            return 0

        if args.command == "retry":
            result = store.retry(args.issue_identifier, reason=args.reason)
            if args.json:
                _json_dump({"claim": result})
            else:
                print(f"retryable {result['issue_identifier']}")
            return 0

        if args.command == "sync":
            result = store.record_sync(
                args.issue_identifier,
                kind=args.kind,
                ok=args.ok,
                error=args.error,
                assignment_owned=None if args.assignment_owned is None else args.assignment_owned == "true",
            )
            if args.json:
                _json_dump({"claim": result})
            else:
                print(f"synced {result['issue_identifier']}")
            return 0

        if args.command == "reconcile":
            result = store.reconcile(
                args.issue_identifier,
                issue_state_name=args.issue_state_name,
                issue_state_type=args.issue_state_type,
                all_claims=args.all,
            )
            if args.json:
                _json_dump({"items": result})
            else:
                print(f"reconciled {len(result)} claim(s)")
            return 0

        if args.command == "run":
            if args.run_command == "start":
                result = store.run_start(
                    args.issue_identifier,
                    phase=args.phase,
                    workspace_path=args.workspace,
                )
                if args.json:
                    _json_dump({"run": result})
                else:
                    print(f"run start {result['issue_identifier']}#{result['attempt']}")
                return 0

            if args.run_command == "finish":
                result = store.run_finish(
                    args.issue_identifier,
                    attempt=args.attempt,
                    state=args.state,
                    last_error=args.error,
                )
                if args.json:
                    _json_dump({"run": result})
                else:
                    print(f"run finish {result['issue_identifier']}#{result['attempt']}")
                return 0

    except ActiveClaimError as exc:
        if args.json:
            _json_dump({"error": "existing claim", "claim": exc.existing_claim})
        else:
            print(f"Error: existing claim for {exc.existing_claim['issue_identifier']}", file=sys.stderr)
            _json_dump(exc.existing_claim)
        return 1
    except (ValueError, sqlite3.Error) as exc:
        if args.json:
            _json_dump({"error": str(exc)})
        else:
            print(f"Error: {exc}", file=sys.stderr)
        return 1

    return 1


if __name__ == "__main__":
    raise SystemExit(main())

