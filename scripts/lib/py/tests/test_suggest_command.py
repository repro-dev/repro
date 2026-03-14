import pytest

from conftest import run_script

KNOWN_COMMANDS = [
    "setup",
    "doctor",
    "checkhealth",
    "cluster",
    "db",
    "start",
    "stop",
    "restart",
    "status",
    "logs",
    "ui",
    "launch",
    "context",
    "worktree",
    "wt",
    "help",
]


class TestSuggestCommand:
    def test_typo_stauts_suggests_status(self):
        result = run_script("suggest_command.py", args=["stauts"] + KNOWN_COMMANDS)
        assert result.returncode == 0
        assert "status" in result.stdout.strip().splitlines()

    def test_typo_strat_suggests_start(self):
        result = run_script("suggest_command.py", args=["strat"] + KNOWN_COMMANDS)
        assert result.returncode == 0
        assert "start" in result.stdout.strip().splitlines()

    def test_typo_stpo_suggests_stop(self):
        result = run_script("suggest_command.py", args=["stpo"] + KNOWN_COMMANDS)
        assert result.returncode == 0
        assert "stop" in result.stdout.strip().splitlines()

    def test_prefix_st_suggests_multiple(self):
        result = run_script("suggest_command.py", args=["st"] + KNOWN_COMMANDS)
        assert result.returncode == 0
        lines = result.stdout.strip().splitlines()
        assert "start" in lines
        assert "status" in lines
        assert "stop" in lines

    def test_prefix_log_suggests_logs(self):
        result = run_script("suggest_command.py", args=["log"] + KNOWN_COMMANDS)
        assert result.returncode == 0
        assert "logs" in result.stdout.strip().splitlines()

    def test_exact_match_returns_command(self):
        result = run_script("suggest_command.py", args=["status"] + KNOWN_COMMANDS)
        assert result.returncode == 0
        assert "status" in result.stdout.strip().splitlines()

    def test_no_match_exits_1(self):
        result = run_script("suggest_command.py", args=["zzzzz"] + KNOWN_COMMANDS)
        assert result.returncode == 1
        assert result.stdout.strip() == ""

    def test_missing_args_exits_1(self):
        result = run_script("suggest_command.py", args=[])
        assert result.returncode == 1

    def test_no_known_commands_exits_1(self):
        result = run_script("suggest_command.py", args=["status"])
        assert result.returncode == 1

    def test_typo_doctr_suggests_doctor(self):
        result = run_script("suggest_command.py", args=["doctr"] + KNOWN_COMMANDS)
        assert result.returncode == 0
        assert "doctor" in result.stdout.strip().splitlines()

    def test_typo_restar_suggests_restart(self):
        result = run_script("suggest_command.py", args=["restar"] + KNOWN_COMMANDS)
        assert result.returncode == 0
        assert "restart" in result.stdout.strip().splitlines()

    def test_typo_clsuter_suggests_cluster(self):
        result = run_script("suggest_command.py", args=["clsuter"] + KNOWN_COMMANDS)
        assert result.returncode == 0
        assert "cluster" in result.stdout.strip().splitlines()

    def test_prefix_work_suggests_worktree(self):
        result = run_script("suggest_command.py", args=["work"] + KNOWN_COMMANDS)
        assert result.returncode == 0
        assert "worktree" in result.stdout.strip().splitlines()

    def test_single_char_distance(self):
        result = run_script("suggest_command.py", args=["sttus"] + KNOWN_COMMANDS)
        assert result.returncode == 0
        assert "status" in result.stdout.strip().splitlines()

    def test_suggestions_are_sorted(self):
        result = run_script("suggest_command.py", args=["st"] + KNOWN_COMMANDS)
        assert result.returncode == 0
        lines = result.stdout.strip().splitlines()
        assert lines == sorted(lines)
