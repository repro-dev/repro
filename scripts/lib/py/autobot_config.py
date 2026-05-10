#!/usr/bin/env python3
"""Repo-scoped Autobot config helpers."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
DEFAULT_VALUES: dict[str, Any] = {
    "engine.auto-discover": "off",
    "engine.queue-depth": 10,
    "engine.max-concurrency": 1,
}
VALID_KEYS = set(DEFAULT_VALUES)
ON_OFF_KEYS = {"engine.auto-discover"}
POSITIVE_INT_KEYS = {"engine.queue-depth", "engine.max-concurrency"}


class ConfigError(Exception):
    pass


def _config_path(path: str | Path) -> Path:
    return Path(path)


def _load_raw_values(config_path: Path) -> dict[str, Any]:
    if not config_path.exists():
        return {}

    try:
        payload = json.loads(config_path.read_text(encoding="utf-8") or "{}")
    except json.JSONDecodeError as exc:
        raise ConfigError(f"invalid JSON in {config_path}") from exc

    if not isinstance(payload, dict):
        raise ConfigError(f"config file must contain a JSON object: {config_path}")

    schema_version = payload.pop("schema_version", SCHEMA_VERSION)
    if schema_version != SCHEMA_VERSION:
        raise ConfigError(
            f"unsupported config schema_version {schema_version!r}; expected {SCHEMA_VERSION}"
        )

    return payload


def _write_raw_values(config_path: Path, values: dict[str, Any]) -> None:
    config_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"schema_version": SCHEMA_VERSION, **values}
    config_path.write_text(json.dumps(payload, sort_keys=True), encoding="utf-8")


def _validate_key(key: str) -> None:
    if key not in VALID_KEYS:
        raise ConfigError(f"unknown config key: {key}")


def _parse_value(key: str, raw_value: str) -> Any:
    _validate_key(key)

    if key in ON_OFF_KEYS:
        value = raw_value.strip().lower()
        if value not in {"on", "off"}:
            raise ConfigError(f"{key} must be 'on' or 'off'")
        return value

    if key in POSITIVE_INT_KEYS:
        try:
            value = int(raw_value)
        except ValueError as exc:
            raise ConfigError(f"{key} must be a positive integer") from exc
        if value < 1:
            raise ConfigError(f"{key} must be a positive integer")
        return value

    raise ConfigError(f"unsupported config key: {key}")


def effective_values(config_path: str | Path) -> dict[str, Any]:
    raw = _load_raw_values(_config_path(config_path))
    values = dict(DEFAULT_VALUES)
    values.update({key: value for key, value in raw.items() if key in VALID_KEYS})
    return values


def get_value(config_path: str | Path, key: str) -> dict[str, Any]:
    _validate_key(key)
    path = _config_path(config_path)
    raw = _load_raw_values(path)
    values = effective_values(path)
    source = "repo" if key in raw else "default"
    return {
        "schema_version": SCHEMA_VERSION,
        "config_path": str(path),
        "key": key,
        "value": values[key],
        "source": source,
    }


def dump_config(config_path: str | Path) -> dict[str, Any]:
    path = _config_path(config_path)
    return {
        "schema_version": SCHEMA_VERSION,
        "config_path": str(path),
        "values": effective_values(path),
    }


def set_value(config_path: str | Path, key: str, raw_value: str) -> dict[str, Any]:
    path = _config_path(config_path)
    value = _parse_value(key, raw_value)
    raw = _load_raw_values(path)
    raw[key] = value
    _write_raw_values(path, raw)
    result = get_value(path, key)
    result["source"] = "repo"
    return result


def unset_value(config_path: str | Path, key: str) -> dict[str, Any]:
    _validate_key(key)
    path = _config_path(config_path)
    raw = _load_raw_values(path)
    raw.pop(key, None)
    _write_raw_values(path, raw)
    return get_value(path, key)


def _render_human(result: dict[str, Any], *, action: str) -> str:
    source = result.get("source") or "default"
    key = result.get("key") or ""
    value = result.get("value")
    if action == "get":
        return f"{key} = {value} ({source})"
    if action == "set":
        return f"set {key} = {value} ({source})"
    if action == "unset":
        return f"unset {key} = {value} ({source})"
    return json.dumps(result)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="autobot_config.py")
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add_config_arg(subparser: argparse.ArgumentParser) -> None:
        subparser.add_argument("--config-file", required=True)
        subparser.add_argument("--json", action="store_true")

    get_parser = subparsers.add_parser("get")
    add_config_arg(get_parser)
    get_parser.add_argument("key")

    set_parser = subparsers.add_parser("set")
    add_config_arg(set_parser)
    set_parser.add_argument("key")
    set_parser.add_argument("value")

    unset_parser = subparsers.add_parser("unset")
    add_config_arg(unset_parser)
    unset_parser.add_argument("key")

    dump_parser = subparsers.add_parser("dump")
    dump_parser.add_argument("--config-file", required=True)
    dump_parser.add_argument("--json", action="store_true")

    args = parser.parse_args(argv)

    try:
        if args.command == "get":
            result = get_value(args.config_file, args.key)
            print(json.dumps(result) if args.json else _render_human(result, action="get"))
            return 0

        if args.command == "set":
            result = set_value(args.config_file, args.key, args.value)
            print(json.dumps(result) if args.json else _render_human(result, action="set"))
            return 0

        if args.command == "unset":
            result = unset_value(args.config_file, args.key)
            print(json.dumps(result) if args.json else _render_human(result, action="unset"))
            return 0

        if args.command == "dump":
            result = dump_config(args.config_file)
            print(json.dumps(result))
            return 0
    except ConfigError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
