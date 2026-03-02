"""Tests for config_upsert.py."""

import json

from conftest import run_script_json


def test_insert_into_empty():
    data = {"services": []}
    result = run_script_json(
        "config_upsert.py",
        stdin=json.dumps(data),
        env={"SVC_NAME": "web", "SVC_SOURCE": "/src/web", "SVC_SLUG": ""},
    )
    assert len(result["services"]) == 1
    assert result["services"][0] == {"name": "web", "source": "/src/web", "slug": ""}


def test_insert_preserves_existing():
    data = {"services": [{"name": "api", "source": "/src/api", "slug": ""}]}
    result = run_script_json(
        "config_upsert.py",
        stdin=json.dumps(data),
        env={"SVC_NAME": "web", "SVC_SOURCE": "/src/web", "SVC_SLUG": ""},
    )
    assert len(result["services"]) == 2
    names = [s["name"] for s in result["services"]]
    assert "api" in names
    assert "web" in names


def test_upsert_replaces_matching_entry():
    data = {"services": [{"name": "web", "source": "/old/path", "slug": "feat-a"}]}
    result = run_script_json(
        "config_upsert.py",
        stdin=json.dumps(data),
        env={"SVC_NAME": "web", "SVC_SOURCE": "/new/path", "SVC_SLUG": "feat-a"},
    )
    assert len(result["services"]) == 1
    assert result["services"][0]["source"] == "/new/path"


def test_upsert_distinguishes_by_slug():
    data = {"services": [{"name": "web", "source": "/src/web", "slug": ""}]}
    result = run_script_json(
        "config_upsert.py",
        stdin=json.dumps(data),
        env={"SVC_NAME": "web", "SVC_SOURCE": "/wt/web", "SVC_SLUG": "feat-b"},
    )
    assert len(result["services"]) == 2


def test_preserves_extra_top_level_keys():
    data = {"version": 1, "services": []}
    result = run_script_json(
        "config_upsert.py",
        stdin=json.dumps(data),
        env={"SVC_NAME": "web", "SVC_SOURCE": "/src", "SVC_SLUG": ""},
    )
    assert result["version"] == 1
