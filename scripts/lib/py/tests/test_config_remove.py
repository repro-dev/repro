"""Tests for config_remove.py."""

import json

from conftest import run_script_json


def test_removes_matching_entry():
    data = {
        "services": [
            {"name": "web", "source": "/src/web", "slug": ""},
            {"name": "api", "source": "/src/api", "slug": ""},
        ]
    }
    result = run_script_json(
        "config_remove.py",
        stdin=json.dumps(data),
        env={"SVC_NAME": "web", "SVC_SLUG": ""},
    )
    assert len(result["services"]) == 1
    assert result["services"][0]["name"] == "api"


def test_removes_by_name_and_slug():
    data = {
        "services": [
            {"name": "web", "source": "/src/web", "slug": ""},
            {"name": "web", "source": "/wt/web", "slug": "feat-a"},
        ]
    }
    result = run_script_json(
        "config_remove.py",
        stdin=json.dumps(data),
        env={"SVC_NAME": "web", "SVC_SLUG": "feat-a"},
    )
    assert len(result["services"]) == 1
    assert result["services"][0]["slug"] == ""


def test_no_match_leaves_unchanged():
    data = {"services": [{"name": "api", "source": "/src/api", "slug": ""}]}
    result = run_script_json(
        "config_remove.py",
        stdin=json.dumps(data),
        env={"SVC_NAME": "web", "SVC_SLUG": ""},
    )
    assert len(result["services"]) == 1
    assert result["services"][0]["name"] == "api"


def test_remove_from_empty():
    data = {"services": []}
    result = run_script_json(
        "config_remove.py",
        stdin=json.dumps(data),
        env={"SVC_NAME": "web", "SVC_SLUG": ""},
    )
    assert result["services"] == []
