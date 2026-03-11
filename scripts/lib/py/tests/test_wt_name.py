"""Tests for wt_name.py — verifies parity with the Starlark wt_name()."""

import subprocess
import sys

import pytest

from conftest import run_script


def _starlark_hash_suffix(s):
    h = 0
    for c in s:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return "%x" % h


def _starlark_wt_name(base, slug, max_len=49):
    full = base + "-wt-" + slug
    if len(full) <= max_len:
        return full
    hash_suffix = _starlark_hash_suffix(slug)[:6]
    budget = max_len - len(base) - len("-wt-") - 1 - 6
    if budget < 1:
        budget = 1
    return base + "-wt-" + slug[:budget] + "-" + hash_suffix


TEST_CASES = [
    ("workspace", "gary-short", 49),
    ("workspace", "gary-rep-237-some-very-long-feature-branch-name-here", 49),
    (
        "api-server",
        "gary-rep-364-reproctl-restartstop-fails-for-worktrees-with-long-branch",
        49,
    ),
    ("gateway", "gary-rep-999-extremely-long-slug-that-exceeds-all-limits-by-far", 49),
    ("a", "b", 49),
    ("workspace", "a", 49),
    ("workspace", "gary-rep-100-just-barely-over-the-limit-xxxxxxxxx", 49),
    ("very-long-base-name", "gary-rep-500-another-long-slug-name-here", 49),
    ("x", "gary-rep-200-slug", 20),
]


class TestWtName:
    @pytest.mark.parametrize("base,slug,max_len", TEST_CASES)
    def test_matches_starlark(self, base, slug, max_len):
        expected = _starlark_wt_name(base, slug, max_len)
        result = run_script("wt_name.py", args=["name", base, slug, str(max_len)])
        assert result.returncode == 0, f"Script failed: {result.stderr}"
        actual = result.stdout.strip()
        assert actual == expected
        assert len(actual) <= max_len

    @pytest.mark.parametrize("base,slug,max_len", TEST_CASES)
    def test_length_constraint(self, base, slug, max_len):
        expected = _starlark_wt_name(base, slug, max_len)
        assert len(expected) <= max_len

    def test_short_name_no_truncation(self):
        result = run_script("wt_name.py", args=["name", "workspace", "gary-short"])
        assert result.returncode == 0
        assert result.stdout.strip() == "workspace-wt-gary-short"

    def test_default_max_len(self):
        result = run_script("wt_name.py", args=["name", "workspace", "short"])
        assert result.returncode == 0
        assert result.stdout.strip() == "workspace-wt-short"

    def test_missing_args(self):
        result = run_script("wt_name.py", args=[])
        assert result.returncode == 1

    def test_backward_compat_bare_args(self):
        result = run_script("wt_name.py", args=["workspace", "gary-short"])
        assert result.returncode == 0
        assert result.stdout.strip() == "workspace-wt-gary-short"

    @pytest.mark.parametrize(
        "base,slug",
        [
            (
                "api-server",
                "gary-rep-364-reproctl-restartstop-fails-for-worktrees-with-long-branch",
            ),
            (
                "workspace",
                "gary-rep-363-worktree-service-hostnames-may-not-resolve-depending-on",
            ),
            (
                "gateway",
                "gary-rep-999-extremely-long-slug-that-exceeds-all-limits-by-far",
            ),
        ],
    )
    def test_k8s_label_constraint(self, base, slug):
        result = run_script("wt_name.py", args=["name", base, slug])
        assert result.returncode == 0
        name = result.stdout.strip()
        longest_resource = name + "-ingress-admin"
        assert len(longest_resource) <= 63, (
            f"Resource name {longest_resource!r} ({len(longest_resource)} chars) "
            f"exceeds 63-byte Kubernetes label limit"
        )


TRUNCATE_SLUG_CASES = [
    ("gary-short", 60),
    ("gary-rep-361-explore-shorter-worktree-slug-format-for-urls-and-directory", 60),
    ("gary-rep-364-reproctl-restartstop-fails-for-worktrees-with-long-branch", 60),
    ("a", 60),
    ("a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q-r-s-t-u-v-w-x-y-z-1234", 60),
    ("exactly-sixty-chars-padding-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", 60),
]


def _expected_truncate_slug(raw, max_len=60):
    if len(raw) <= max_len:
        return raw
    hash_part = _starlark_hash_suffix(raw)[:6]
    budget = max_len - 1 - 6
    if budget < 1:
        budget = 1
    truncated = raw[:budget]
    if truncated.endswith("-"):
        truncated = truncated[:-1]
    return truncated + "-" + hash_part


class TestTruncateSlug:
    @pytest.mark.parametrize("raw,max_len", TRUNCATE_SLUG_CASES)
    def test_output_matches_expected(self, raw, max_len):
        expected = _expected_truncate_slug(raw, max_len)
        result = run_script("wt_name.py", args=["slug", raw, str(max_len)])
        assert result.returncode == 0, f"Script failed: {result.stderr}"
        actual = result.stdout.strip()
        assert actual == expected

    @pytest.mark.parametrize("raw,max_len", TRUNCATE_SLUG_CASES)
    def test_length_within_limit(self, raw, max_len):
        result = run_script("wt_name.py", args=["slug", raw, str(max_len)])
        assert result.returncode == 0
        actual = result.stdout.strip()
        assert len(actual) <= max_len

    def test_short_slug_passthrough(self):
        result = run_script("wt_name.py", args=["slug", "gary-short"])
        assert result.returncode == 0
        assert result.stdout.strip() == "gary-short"

    def test_long_slug_truncated(self):
        long_slug = (
            "gary-rep-361-explore-shorter-worktree-slug-format-for-urls-and-directory"
        )
        result = run_script("wt_name.py", args=["slug", long_slug])
        assert result.returncode == 0
        actual = result.stdout.strip()
        assert len(actual) <= 60
        assert actual != long_slug
        assert "-" in actual[-7:]

    def test_deterministic(self):
        slug = (
            "gary-rep-361-explore-shorter-worktree-slug-format-for-urls-and-directory"
        )
        r1 = run_script("wt_name.py", args=["slug", slug])
        r2 = run_script("wt_name.py", args=["slug", slug])
        assert r1.stdout == r2.stdout

    def test_trailing_hyphen_stripped(self):
        slug = "a" * 52 + "-" + "b" * 20
        result = run_script("wt_name.py", args=["slug", slug, "60"])
        assert result.returncode == 0
        actual = result.stdout.strip()
        parts = actual.rsplit("-", 1)
        assert not parts[0].endswith("-")

    @pytest.mark.parametrize(
        "slug",
        [
            "gary-rep-361-explore-shorter-worktree-slug-format-for-urls-and-directory",
            "gary-rep-364-reproctl-restartstop-fails-for-worktrees-with-long-branch",
            "gary-rep-363-worktree-service-hostnames-may-not-resolve-depending-on",
        ],
    )
    def test_dns_label_constraint(self, slug):
        result = run_script("wt_name.py", args=["slug", slug])
        assert result.returncode == 0
        truncated = result.stdout.strip()
        dns_label = "wt-" + truncated
        assert len(dns_label) <= 63, (
            f"DNS label {dns_label!r} ({len(dns_label)} chars) "
            f"exceeds 63-byte DNS label limit"
        )

    def test_missing_args(self):
        result = run_script("wt_name.py", args=["slug"])
        assert result.returncode == 1
