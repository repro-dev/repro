#!/usr/bin/env python3
"""Pure helpers for autonomous discovery and sequencing."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
ISSUE_IDENTIFIER_PATTERN = re.compile(r"^REP-\d+$")
FENCED_JSON_PATTERN = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.IGNORECASE | re.DOTALL)

EVALUATION_PLACEHOLDER = "{{CANDIDATE_EVALUATION_JSON}}"
RESULT_LIMIT_PLACEHOLDER = "{{RESULT_LIMIT}}"
SCHEMA_PLACEHOLDER = "{{SCHEMA_VERSION}}"


class SequenceValidationError(ValueError):
    """Raised when the LLM response cannot be normalized safely."""


def _as_mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _coerce_result_limit(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, str) and value.isdigit():
        parsed = int(value)
        return parsed if parsed > 0 else None
    return None


def _coerce_json_text(raw_response_text: str) -> str:
    text = raw_response_text.strip()
    if not text:
        raise SequenceValidationError("LLM response was empty; ask OpenCode to return strict JSON only")

    match = FENCED_JSON_PATTERN.search(text)
    if match:
        return match.group(1).strip()

    return text


def _load_json_text(raw_text: str, *, label: str) -> dict[str, Any]:
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise SequenceValidationError(f"{label} was not valid JSON; ask OpenCode to return strict JSON only") from exc

    if not isinstance(payload, dict):
        raise SequenceValidationError(f"{label} must be a JSON object")

    return payload


def _issue_identifier(value: Any, *, context: str) -> str:
    issue_identifier = str(value or "").strip()
    if not issue_identifier:
        raise SequenceValidationError(f"{context} is missing an issue_identifier")
    if not ISSUE_IDENTIFIER_PATTERN.fullmatch(issue_identifier):
        raise SequenceValidationError(f"{context} has an invalid issue_identifier: {issue_identifier}")
    return issue_identifier


def _evaluation_items(evaluation: dict[str, Any]) -> list[dict[str, Any]]:
    items = _as_list(evaluation.get("items"))
    return [item for item in items if isinstance(item, dict)]


def _evaluation_lookup(evaluation: dict[str, Any]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for item in _evaluation_items(evaluation):
        issue_id = str(item.get("issue_identifier") or item.get("identifier") or "").strip()
        if issue_id and issue_id not in lookup:
            lookup[issue_id] = item
    return lookup


def _evaluation_issue_ids(evaluation: dict[str, Any]) -> list[str]:
    issue_ids: list[str] = []
    seen: set[str] = set()
    for item in _evaluation_items(evaluation):
        issue_id = str(item.get("issue_identifier") or item.get("identifier") or "").strip()
        if issue_id and issue_id not in seen:
            seen.add(issue_id)
            issue_ids.append(issue_id)
    return issue_ids


def render_sequence_prompt(
    template_text: str,
    evaluation: dict[str, Any],
    *,
    result_limit: int | None = None,
    schema_version: int = SCHEMA_VERSION,
) -> str:
    if not isinstance(template_text, str):
        raise SequenceValidationError("prompt template must be text")

    evaluation_json = json.dumps(evaluation, indent=2, sort_keys=True)
    result_limit_text = str(result_limit) if result_limit is not None else "unbounded"
    return (
        template_text.replace(EVALUATION_PLACEHOLDER, evaluation_json)
        .replace(RESULT_LIMIT_PLACEHOLDER, result_limit_text)
        .replace(SCHEMA_PLACEHOLDER, str(schema_version))
    )


def apply_sequence_result_limit(canonical: dict[str, Any], result_limit: int | None) -> dict[str, Any]:
    limit = _coerce_result_limit(result_limit)
    if limit is None:
        return canonical

    waves: list[dict[str, Any]] = []
    deferred = [item for item in _as_list(canonical.get("deferred")) if isinstance(item, dict)]
    overflow_deferred: list[dict[str, str]] = []
    kept_ready_count = 0

    for wave in _as_list(canonical.get("waves")):
        if not isinstance(wave, dict):
            continue

        issue_entries = wave.get("issues")
        if not isinstance(issue_entries, list):
            issue_entries = []

        kept_issue_entries: list[dict[str, Any]] = []
        for issue_entry in issue_entries:
            if not isinstance(issue_entry, dict):
                continue

            if kept_ready_count < limit:
                kept_issue_entries.append(issue_entry)
                kept_ready_count += 1
                continue

            overflow_deferred.append(
                {
                    "issue_identifier": str(issue_entry.get("issue_identifier") or issue_entry.get("identifier") or ""),
                    "reason": f"post-sequencing-cap:{limit}",
                    "rationale": str(issue_entry.get("rationale") or issue_entry.get("reason") or ""),
                }
            )

        if kept_issue_entries:
            limited_wave = dict(wave)
            limited_wave["issues"] = kept_issue_entries
            waves.append(limited_wave)

    capped = dict(canonical)
    capped["waves"] = waves
    capped["deferred"] = deferred + overflow_deferred
    return capped


def load_prompt_template(template_file: Path | str) -> str:
    return Path(template_file).read_text(encoding="utf-8")


def _coerce_issue_entry(entry: Any, *, context: str) -> dict[str, str]:
    if isinstance(entry, str):
        issue_identifier = _issue_identifier(entry, context=context)
        return {"issue_identifier": issue_identifier, "rationale": ""}

    if not isinstance(entry, dict):
        raise SequenceValidationError(f"{context} must be a string or object")

    issue_identifier = _issue_identifier(entry.get("issue_identifier") or entry.get("identifier"), context=context)
    rationale = str(entry.get("rationale") or entry.get("reason") or "")
    return {"issue_identifier": issue_identifier, "rationale": rationale}


def _coerce_deferred_entry(entry: Any, *, context: str) -> dict[str, str]:
    deferred = _coerce_issue_entry(entry, context=context)
    if isinstance(entry, dict):
        deferred["reason"] = str(entry.get("reason") or entry.get("rationale") or "")
    else:
        deferred["reason"] = ""
    return deferred


def normalize_sequence_response(
    raw_response_text: str,
    evaluation: dict[str, Any],
    *,
    schema_version: int = SCHEMA_VERSION,
) -> dict[str, Any]:
    evaluation_map = _as_mapping(evaluation)
    evaluation_lookup = _evaluation_lookup(evaluation_map)
    evaluation_ids = _evaluation_issue_ids(evaluation_map)
    allowed_issue_ids = set(evaluation_ids)

    response_text = _coerce_json_text(raw_response_text)
    payload = _load_json_text(response_text, label="LLM response")

    response_schema_version = payload.get("schema_version")
    if response_schema_version != schema_version:
        raise SequenceValidationError(
            f"LLM response schema_version must be {schema_version}, got {response_schema_version!r}"
        )

    waves_payload = _as_list(payload.get("waves"))
    deferred_payload = _as_list(payload.get("deferred"))
    risk_notes_payload = _as_list(payload.get("risk_notes"))

    if "waves" not in payload:
        raise SequenceValidationError("LLM response is missing waves")
    if "deferred" not in payload:
        raise SequenceValidationError("LLM response is missing deferred")
    if "risk_notes" not in payload:
        raise SequenceValidationError("LLM response is missing risk_notes")

    normalized_waves: list[dict[str, Any]] = []
    normalized_deferred: list[dict[str, str]] = []
    seen_issue_ids: set[str] = set()

    for wave_index, wave in enumerate(waves_payload, start=1):
        if not isinstance(wave, dict):
            raise SequenceValidationError(f"wave {wave_index} must be an object")

        issue_entries = wave.get("issues")
        if issue_entries is None and isinstance(wave.get("issue_identifiers"), list):
            issue_entries = wave.get("issue_identifiers")

        if not isinstance(issue_entries, list):
            raise SequenceValidationError(f"wave {wave_index} is missing issues")

        normalized_issue_entries: list[dict[str, str]] = []
        for issue_index, issue_entry in enumerate(issue_entries, start=1):
            normalized_issue = _coerce_issue_entry(issue_entry, context=f"wave {wave_index} issue {issue_index}")
            issue_identifier = normalized_issue["issue_identifier"]
            if issue_identifier not in allowed_issue_ids:
                raise SequenceValidationError(
                    f"wave {wave_index} references {issue_identifier}, which was not present in the candidate evaluation"
                )
            if evaluation_lookup.get(issue_identifier, {}).get("eligible") is not True:
                raise SequenceValidationError(
                    f"wave {wave_index} references {issue_identifier}, which is ineligible in the candidate evaluation and must remain deferred"
                )
            if issue_identifier in seen_issue_ids:
                raise SequenceValidationError(f"issue {issue_identifier} appears in more than one wave or deferred entry")
            seen_issue_ids.add(issue_identifier)
            normalized_issue_entries.append(normalized_issue)

        normalized_waves.append(
            {
                "name": str(wave.get("name") or f"wave-{wave_index}"),
                "issues": normalized_issue_entries,
                "rationale": str(wave.get("rationale") or ""),
            }
        )

    for deferred_index, deferred in enumerate(deferred_payload, start=1):
        normalized_deferred_entry = _coerce_deferred_entry(deferred, context=f"deferred item {deferred_index}")
        issue_identifier = normalized_deferred_entry["issue_identifier"]
        if issue_identifier not in allowed_issue_ids:
            raise SequenceValidationError(
                f"deferred item {deferred_index} references {issue_identifier}, which was not present in the candidate evaluation"
            )
        if issue_identifier in seen_issue_ids:
            raise SequenceValidationError(f"issue {issue_identifier} appears in more than one wave or deferred entry")
        seen_issue_ids.add(issue_identifier)
        normalized_deferred.append(normalized_deferred_entry)

    missing_issue_ids = [issue_id for issue_id in evaluation_ids if issue_id not in seen_issue_ids]
    if missing_issue_ids:
        raise SequenceValidationError(
            "LLM response did not account for every candidate issue: " + ", ".join(missing_issue_ids)
        )

    return {
        "schema_version": schema_version,
        "waves": normalized_waves,
        "deferred": normalized_deferred,
        "risk_notes": [str(note) for note in risk_notes_payload],
    }


def _sequence_artifact_paths(output_dir: Path | str) -> dict[str, Path]:
    output_path = Path(output_dir)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return {
        "prompt_path": output_path / f"{timestamp}-prompt.md",
        "raw_response_path": output_path / f"{timestamp}-raw.txt",
        "canonical_path": output_path / f"{timestamp}-canonical.json",
        "error_path": output_path / f"{timestamp}-error.json",
        "latest_path": output_path / "latest.json",
    }


def write_sequence_artifacts(
    output_dir: Path | str,
    *,
    prompt_text: str,
    raw_response_text: str,
    canonical: dict[str, Any],
) -> dict[str, Any]:
    paths = _sequence_artifact_paths(output_dir)
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    artifacts = {
        "prompt_path": str(paths["prompt_path"]),
        "raw_response_path": str(paths["raw_response_path"]),
        "canonical_path": str(paths["canonical_path"]),
        "latest_path": str(paths["latest_path"]),
    }

    canonical_with_artifacts = dict(canonical)
    canonical_with_artifacts["artifacts"] = artifacts

    paths["prompt_path"].write_text(prompt_text, encoding="utf-8")
    paths["raw_response_path"].write_text(raw_response_text.rstrip() + "\n", encoding="utf-8")

    rendered = json.dumps(canonical_with_artifacts, indent=2, sort_keys=True)
    paths["canonical_path"].write_text(rendered + "\n", encoding="utf-8")
    paths["latest_path"].write_text(rendered + "\n", encoding="utf-8")

    return canonical_with_artifacts


def write_sequence_error_artifacts(
    output_dir: Path | str,
    *,
    prompt_text: str,
    raw_response_text: str,
    error: SequenceValidationError,
) -> dict[str, Any]:
    paths = _sequence_artifact_paths(output_dir)
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    artifacts = {
        "prompt_path": str(paths["prompt_path"]),
        "raw_response_path": str(paths["raw_response_path"]),
        "error_path": str(paths["error_path"]),
        "latest_path": str(paths["latest_path"]),
    }

    error_payload = {
        "schema_version": SCHEMA_VERSION,
        "status": "error",
        "error": {
            "type": type(error).__name__,
            "message": str(error),
        },
        "artifacts": artifacts,
    }

    paths["prompt_path"].write_text(prompt_text, encoding="utf-8")
    paths["raw_response_path"].write_text(raw_response_text.rstrip() + "\n", encoding="utf-8")

    rendered = json.dumps(error_payload, indent=2, sort_keys=True)
    paths["error_path"].write_text(rendered + "\n", encoding="utf-8")
    paths["latest_path"].write_text(rendered + "\n", encoding="utf-8")

    return error_payload


def _parse_json_argument(value: str, *, label: str) -> dict[str, Any]:
    return _load_json_text(value, label=label)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="autonomy_sequence.py")
    subparsers = parser.add_subparsers(dest="command", required=True)

    render_parser = subparsers.add_parser("render")
    render_parser.add_argument("--template-file", required=True)
    render_parser.add_argument("--evaluation-json", required=True)
    render_parser.add_argument("--result-limit", type=int)
    render_parser.add_argument("--schema-version", type=int, default=SCHEMA_VERSION)

    finalize_parser = subparsers.add_parser("finalize")
    finalize_parser.add_argument("--template-file", required=True)
    finalize_parser.add_argument("--evaluation-json", required=True)
    finalize_parser.add_argument("--raw-response", required=True)
    finalize_parser.add_argument("--output-dir", required=True)
    finalize_parser.add_argument("--result-limit", type=int)
    finalize_parser.add_argument("--schema-version", type=int, default=SCHEMA_VERSION)

    args = parser.parse_args(argv)

    if args.command == "render":
        template_text = load_prompt_template(args.template_file)
        evaluation = _parse_json_argument(args.evaluation_json, label="candidate evaluation")
        print(
            render_sequence_prompt(
                template_text,
                evaluation,
                result_limit=args.result_limit,
                schema_version=args.schema_version,
            )
        )
        return 0

    if args.command == "finalize":
        template_text = load_prompt_template(args.template_file)
        evaluation = _parse_json_argument(args.evaluation_json, label="candidate evaluation")
        prompt_text = render_sequence_prompt(
            template_text,
            evaluation,
            result_limit=args.result_limit,
            schema_version=args.schema_version,
        )
        try:
            canonical = normalize_sequence_response(args.raw_response, evaluation, schema_version=args.schema_version)
        except SequenceValidationError as exc:
            written = write_sequence_error_artifacts(
                args.output_dir,
                prompt_text=prompt_text,
                raw_response_text=args.raw_response,
                error=exc,
            )
            print(f"Sequencing validation failed: {exc}", file=sys.stderr)
            print(json.dumps(written, indent=2, sort_keys=True), file=sys.stderr)
            return 1

        canonical = apply_sequence_result_limit(canonical, args.result_limit)
        written = write_sequence_artifacts(
            args.output_dir,
            prompt_text=prompt_text,
            raw_response_text=args.raw_response,
            canonical=canonical,
        )
        print(json.dumps(written, indent=2, sort_keys=True))
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
