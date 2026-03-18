"""Tests for wait_healthy.py — arg parsing and classification logic."""

import importlib.util
import sys
from pathlib import Path

SCRIPTS_PY_DIR = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location(
    "wait_healthy", str(SCRIPTS_PY_DIR / "wait_healthy.py")
)
wh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wh)


class TestParseArgs:
    def test_targets_only(self):
        port, targets, deps = wh.parse_args(
            ["wait_healthy.py", "10350", "svc-a", "svc-b"]
        )
        assert port == "10350"
        assert targets == ["svc-a", "svc-b"]
        assert deps == []

    def test_deps_and_targets(self):
        port, targets, deps = wh.parse_args(
            ["wait_healthy.py", "10350", "--deps", "db", "storage", "--", "svc"]
        )
        assert port == "10350"
        assert targets == ["svc"]
        assert deps == ["db", "storage"]

    def test_no_resources(self):
        port, targets, deps = wh.parse_args(["wait_healthy.py", "10350"])
        assert port == "10350"
        assert targets == []
        assert deps == []

    def test_multiple_dep_groups(self):
        port, targets, deps = wh.parse_args(
            ["wait_healthy.py", "10350", "--deps", "a", "b", "--", "c"]
        )
        assert deps == ["a", "b"]
        assert targets == ["c"]


class TestClassify:
    def _item(self, runtime="ok", update="ok"):
        return {"status": {"runtimeStatus": runtime, "updateStatus": update}}

    def test_healthy(self):
        status, detail = wh.classify(self._item("ok", "ok"))
        assert status == "ok"

    def test_not_applicable_is_ok(self):
        status, _ = wh.classify(self._item("not_applicable", "none"))
        assert status == "ok"

    def test_building(self):
        status, _ = wh.classify(self._item("pending", "in_progress"))
        assert status == "building"

    def test_error(self):
        status, _ = wh.classify(self._item("error", "ok"))
        assert status == "error"

    def test_pending(self):
        status, _ = wh.classify(self._item("pending", "pending"))
        assert status == "pending"
