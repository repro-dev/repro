"""Shared helpers for subprocess-based script tests."""

import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPTS_PY_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = Path(__file__).resolve().parents[4]


def run_script(name, *, stdin=None, env=None, args=None):
    """Run a script under lib/py/ and return the CompletedProcess."""
    script = SCRIPTS_PY_DIR / name
    cmd = [sys.executable, str(script)] + (args or [])

    full_env = {**os.environ, **(env or {})}
    full_env.pop("PYTHONDONTWRITEBYTECODE", None)

    return subprocess.run(
        cmd,
        input=stdin,
        capture_output=True,
        text=True,
        env=full_env,
    )


def run_script_json(name, *, stdin=None, env=None, args=None):
    """Run a script and parse its stdout as JSON."""
    result = run_script(name, stdin=stdin, env=env, args=args)
    assert result.returncode == 0, f"Script failed: {result.stderr}"
    return json.loads(result.stdout)


def run_repo_script(relative_path, *, stdin=None, env=None, args=None):
    """Run a repo-level script and return the CompletedProcess."""
    script = REPO_ROOT / relative_path
    cmd = [sys.executable, str(script)] + (args or [])

    full_env = {**os.environ, **(env or {})}
    full_env.pop("PYTHONDONTWRITEBYTECODE", None)

    return subprocess.run(
        cmd,
        input=stdin,
        capture_output=True,
        text=True,
        env=full_env,
    )
