import json
import subprocess
import sys

import pytest

SCRIPT = "scripts/lib/py/worktree_list_json.py"


def run(porcelain: str, config: str = "") -> list[dict]:
    result = subprocess.run(
        [sys.executable, SCRIPT, porcelain, config],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


class TestWorktreeListJson:
    def test_basic_worktrees(self):
        porcelain = (
            "worktree /Users/gary/Projects/repro-dev/repro\n"
            "HEAD 64005c404311538f64cf517798ba61c37fa19ed6\n"
            "branch refs/heads/main\n"
            "\n"
            "worktree /Users/gary/Projects/repro-dev/repro-wt-gary-rep-280-add-checkbox\n"
            "HEAD 4141bc01a09e536d4f3ca4e5015beab47c024b21\n"
            "branch refs/heads/gary/rep-280-add-checkbox\n"
            "\n"
        )
        result = run(porcelain)
        assert len(result) == 2

        assert result[0]["slug"] == "main"
        assert result[0]["path"] == "/Users/gary/Projects/repro-dev/repro"
        assert result[0]["branch"] == "main"
        assert result[0]["head"] == "64005c40"
        assert result[0]["bare"] is False
        assert result[0]["services"] == []

        assert result[1]["slug"] == "gary-rep-280-add-checkbox"
        assert result[1]["branch"] == "gary/rep-280-add-checkbox"
        assert result[1]["head"] == "4141bc01"

    def test_bare_worktree(self):
        porcelain = (
            "worktree /Users/gary/Projects/repro-dev/repro.git\n"
            "HEAD 0000000000000000000000000000000000000000\n"
            "bare\n"
            "\n"
        )
        result = run(porcelain)
        assert len(result) == 1
        assert result[0]["bare"] is True
        assert result[0]["branch"] is None

    def test_detached_head(self):
        porcelain = (
            "worktree /Users/gary/Projects/repro-dev/repro\n"
            "HEAD abcdef0123456789abcdef0123456789abcdef01\n"
            "detached\n"
            "\n"
        )
        result = run(porcelain)
        assert len(result) == 1
        assert result[0]["branch"] is None
        assert result[0]["head"] == "abcdef01"

    def test_with_services(self):
        porcelain = (
            "worktree /Users/gary/Projects/repro-dev/repro\n"
            "HEAD 64005c404311538f64cf517798ba61c37fa19ed6\n"
            "branch refs/heads/main\n"
            "\n"
            "worktree /Users/gary/Projects/repro-dev/repro-wt-gary-rep-280-add-checkbox\n"
            "HEAD 4141bc01a09e536d4f3ca4e5015beab47c024b21\n"
            "branch refs/heads/gary/rep-280-add-checkbox\n"
            "\n"
        )
        config = json.dumps(
            {
                "services": [
                    {"name": "web", "source": ".", "slug": "main"},
                    {
                        "name": "api-server",
                        "source": ".",
                        "slug": "gary-rep-280-add-checkbox",
                    },
                    {
                        "name": "capture",
                        "source": ".",
                        "slug": "gary-rep-280-add-checkbox",
                    },
                ]
            }
        )
        result = run(porcelain, config)
        assert result[0]["services"] == ["web"]
        assert result[1]["services"] == ["api-server", "capture"]

    def test_empty_input(self):
        result = run("")
        assert result == []

    def test_invalid_config_json(self):
        porcelain = (
            "worktree /Users/gary/Projects/repro-dev/repro\n"
            "HEAD 64005c404311538f64cf517798ba61c37fa19ed6\n"
            "branch refs/heads/main\n"
            "\n"
        )
        result = run(porcelain, "not-json")
        assert len(result) == 1
        assert result[0]["services"] == []

    def test_no_trailing_blank_line(self):
        porcelain = (
            "worktree /Users/gary/Projects/repro-dev/repro\n"
            "HEAD 64005c404311538f64cf517798ba61c37fa19ed6\n"
            "branch refs/heads/main"
        )
        result = run(porcelain)
        assert len(result) == 1
        assert result[0]["slug"] == "main"
