"""Shared helpers for subprocess-based script tests."""

import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPTS_PY_DIR = Path(__file__).resolve().parent.parent


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
