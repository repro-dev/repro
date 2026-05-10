"""Tests for autobot_config.py."""

from pathlib import Path

from conftest import run_script, run_script_json


def test_get_returns_repo_defaults_when_config_is_missing(tmp_path: Path):
    config_path = tmp_path / ".autobot" / "config.json"

    result = run_script_json(
        "autobot_config.py",
        args=["get", "--config-file", str(config_path), "--json", "engine.auto-discover"],
    )

    assert result == {
        "schema_version": 1,
        "config_path": str(config_path),
        "key": "engine.auto-discover",
        "value": "off",
        "source": "default",
    }


def test_set_persists_and_gets_repo_override(tmp_path: Path):
    config_path = tmp_path / ".autobot" / "config.json"

    write_result = run_script_json(
        "autobot_config.py",
        args=["set", "--config-file", str(config_path), "--json", "engine.auto-discover", "on"],
    )
    read_result = run_script_json(
        "autobot_config.py",
        args=["get", "--config-file", str(config_path), "--json", "engine.auto-discover"],
    )

    assert config_path.exists()
    assert write_result["value"] == "on"
    assert write_result["source"] == "repo"
    assert read_result["value"] == "on"
    assert read_result["source"] == "repo"


def test_unset_falls_back_to_default(tmp_path: Path):
    config_path = tmp_path / ".autobot" / "config.json"

    run_script_json(
        "autobot_config.py",
        args=["set", "--config-file", str(config_path), "--json", "engine.max-concurrency", "3"],
    )
    result = run_script_json(
        "autobot_config.py",
        args=["unset", "--config-file", str(config_path), "--json", "engine.max-concurrency"],
    )

    assert result["value"] == 1
    assert result["source"] == "default"
    dump = run_script_json(
        "autobot_config.py",
        args=["dump", "--config-file", str(config_path)],
    )
    assert dump["values"]["engine.max-concurrency"] == 1


def test_invalid_keys_and_values_fail_cleanly(tmp_path: Path):
    config_path = tmp_path / ".autobot" / "config.json"

    bad_key = run_script(
        "autobot_config.py",
        args=["get", "--config-file", str(config_path), "--json", "not.real"],
    )
    bad_value = run_script(
        "autobot_config.py",
        args=["set", "--config-file", str(config_path), "--json", "engine.auto-discover", "maybe"],
    )

    assert bad_key.returncode != 0
    assert "unknown config key" in bad_key.stderr
    assert bad_value.returncode != 0
    assert "must be" in bad_value.stderr
